import { v } from "convex/values";
import { query, mutation, action } from "./_generated/server";
import { exigirAdmin } from "./lib/admin";

// Cache para o token OAuth (em produção, considere usar uma tabela no Convex)
interface TokenCache {
  accessToken: string | null;
  expiresAt: number; // timestamp em milissegundos
}

// Cache em memória (será resetado quando a função for reiniciada)
// Em produção, considere usar uma tabela no Convex para persistir
let tokenCache: TokenCache = {
  accessToken: null,
  expiresAt: 0,
};

/**
 * Obtém token OAuth do Amadeus (com cache)
 */
async function getAmadeusToken(): Promise<string> {
  const now = Date.now();
  
  // Verifica se o token ainda é válido (com margem de 30 segundos)
  if (tokenCache.accessToken && now < tokenCache.expiresAt - 30000) {
    return tokenCache.accessToken;
  }

  const clientId = process.env.AMADEUS_CLIENT_ID;
  const clientSecret = process.env.AMADEUS_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Amadeus credentials not configured. Set AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET in Convex Dashboard.");
  }

  // Fazer requisição OAuth
  const formData = new URLSearchParams();
  formData.append("grant_type", "client_credentials");
  formData.append("client_id", clientId);
  formData.append("client_secret", clientSecret);

  const response = await fetch("https://api.amadeus.com/v1/security/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
  });

  if (!response.ok) {
    let errorMessage = `Amadeus OAuth failed: ${response.status} ${response.statusText}`;
    
    try {
      const errorData = await response.json();
      console.error("[Flights] OAuth error response:", JSON.stringify(errorData));
      
      if (errorData.error_description) {
        errorMessage += ` - ${errorData.error_description}`;
      } else if (errorData.error) {
        errorMessage += ` - ${errorData.error}`;
      }
      
      // Mensagem específica para 401
      if (response.status === 401) {
        errorMessage += `. Please verify that AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET in Convex Dashboard are correct production credentials (not test credentials).`;
      }
    } catch (e) {
      // Se não conseguir parsear o erro, usar a mensagem padrão
      console.error("[Flights] Could not parse OAuth error response");
    }
    
    throw new Error(errorMessage);
  }

  const data = await response.json();
  const accessToken = data.access_token;
  const expiresIn = data.expires_in || 1799; // default 30 minutos

  if (!accessToken) {
    throw new Error("Amadeus auth failed: no access token received");
  }
  
  console.log("[Flights] OAuth token obtained successfully");

  // Atualizar cache
  tokenCache = {
    accessToken,
    expiresAt: now + expiresIn * 1000,
  };

  return accessToken;
}

/**
 * Parse do número de voo (ex: "EK215" ou "UAE215" -> carrier: "EK"/"UAE", number: "215")
 */
function parseFlightNumber(rawFlightNumber: string): { carrier: string; number: string } {
  if (!rawFlightNumber || rawFlightNumber.trim() === "") {
    throw new Error("flightNumber required");
  }

  // Remove espaços e hífens, converte para maiúsculas
  const cleaned = rawFlightNumber.replace(/[\s-]+/g, "").toUpperCase();

  // Regex: 2-3 letras (carrier) + 1-4 dígitos (número)
  const match = cleaned.match(/^([A-Z]{2,3})(\d{1,4})$/);

  if (!match || !match[1] || !match[2]) {
    throw new Error("format must be <carrier><number>, e.g. EK215 or UAE215");
  }

  const carrier = match[1];
  let number = match[2].replace(/^0+/, ""); // Remove zeros à esquerda
  if (number === "") number = "0";

  return { carrier, number };
}

/**
 * Converte código ICAO para IATA se necessário
 */
async function toIataIfNeeded(bearer: string, carrier: string): Promise<string> {
  // Se já é IATA (2 letras), retorna direto
  if (carrier.length === 2) {
    return carrier;
  }

  // Busca informações da companhia aérea
  const response = await fetch(
    `https://api.amadeus.com/v1/reference-data/airlines?airlineCodes=${carrier}`,
    {
      headers: {
        Authorization: bearer,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch airline data: ${response.status}`);
  }

  const data = await response.json();
  const airlines = data.data || [];

  // Procura pelo código ICAO e retorna o IATA correspondente
  for (const airline of airlines) {
    const icao = airline.icaoCode;
    const iata = airline.iataCode;
    if (carrier === icao && iata && iata.trim() !== "") {
      return iata;
    }
  }

  throw new Error(
    `unknown airline ICAO code '${carrier}'. Try using the 2-letter IATA code (e.g., EK215).`
  );
}

/**
 * Busca informações de voo no Amadeus
 */
async function getFlightInfo(
  bearer: string,
  carrierCode: string,
  flightNumber: string,
  depDate: string
): Promise<any> {
  // Validar parâmetros
  if (!carrierCode || !flightNumber || !depDate) {
    throw new Error(`Missing required parameters: carrierCode=${carrierCode}, flightNumber=${flightNumber}, depDate=${depDate}`);
  }

  // Validar formato da data (yyyy-MM-dd)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(depDate)) {
    throw new Error(`Invalid date format. Expected yyyy-MM-dd, got: ${depDate}`);
  }

  // Codificar parâmetros da URL
  // Nota: A API da Amadeus espera carrierCode (IATA de 2 letras) e flightNumber (apenas números)
  const url = new URL("https://api.amadeus.com/v2/schedule/flights");
  url.searchParams.set("carrierCode", carrierCode);
  url.searchParams.set("flightNumber", flightNumber);
  url.searchParams.set("scheduledDepartureDate", depDate);

  const fullUrl = url.toString();
  console.log("[Flights] getFlightInfo - Request URL:", fullUrl);
  console.log("[Flights] getFlightInfo - Parameters:", {
    carrierCode,
    flightNumber,
    scheduledDepartureDate: depDate,
  });

  const response = await fetch(fullUrl, {
    headers: {
      Authorization: bearer,
    },
  });

  if (!response.ok) {
    let errorMessage = `Failed to fetch flight data: ${response.status} ${response.statusText}`;
    let errorDetails: any = null;
    
    try {
      errorDetails = await response.json();
      console.log("[Flights] getFlightInfo - Error response:", JSON.stringify(errorDetails).substring(0, 500));
      
      if (errorDetails.errors && Array.isArray(errorDetails.errors)) {
        const errorMessages = errorDetails.errors.map((e: any) => e.detail || e.title || e.code).join(", ");
        errorMessage += ` - ${errorMessages}`;
      } else if (errorDetails.message) {
        errorMessage += ` - ${errorDetails.message}`;
      }
    } catch (e) {
      // Se não conseguir parsear o erro, usar a mensagem padrão
      console.log("[Flights] getFlightInfo - Could not parse error response");
    }
    
    if (response.status === 404) {
      throw new Error(
        `Flight not found: ${carrierCode}${flightNumber} on ${depDate}. ` +
        `The flight may not exist in Amadeus test database or the date may be too far in the past/future.`
      );
    }
    throw new Error(errorMessage);
  }

  const result = await response.json();
  console.log("[Flights] getFlightInfo - Success, data length:", result.data?.length || 0);
  return result;
}

/**
 * Busca nome da companhia aérea (função helper)
 */
async function fetchAirlineName(bearer: string, code: string): Promise<string | null> {
  if (!code || code.trim() === "") {
    return null;
  }

  const response = await fetch(
    `https://api.amadeus.com/v1/reference-data/airlines?airlineCodes=${code}`,
    {
      headers: {
        Authorization: bearer,
      },
    }
  );

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const airlines = data.data || [];

  for (const airline of airlines) {
    const iata = airline.iataCode;
    const icao = airline.icaoCode;
    const name = airline.businessName;
    if (code.toUpperCase() === iata?.toUpperCase() || code.toUpperCase() === icao?.toUpperCase()) {
      return name || null;
    }
  }

  return null;
}

function normalizeDepartureDateInput(rawDate: string): string {
  const trimmed = rawDate.trim();
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:$|[T\s].*)/);

  if (!match || !match[1]) {
    throw new Error(`Invalid date format. Expected yyyy-MM-dd, got: ${rawDate}`);
  }

  return match[1];
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }

  return null;
}

function getPreferredTiming(
  timings: Array<{ qualifier?: string; value?: string }> | undefined,
  qualifiers: string[]
): { value: string | null; source: string | null } {
  const safeTimings = Array.isArray(timings) ? timings : [];

  for (const qualifier of qualifiers) {
    const match = safeTimings.find(
      (timing) =>
        timing?.qualifier === qualifier &&
        typeof timing.value === "string" &&
        timing.value.trim() !== ""
    );

    if (match?.value) {
      return {
        value: match.value,
        source: qualifier,
      };
    }
  }

  return { value: null, source: null };
}

function compactObject<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== null && entryValue !== undefined)
  ) as Partial<T>;
}

function buildFlightLookupResponse(args: {
  carrierCode: string;
  normalizedFlightNumber: string;
  airlineName: string | null;
  flight: any;
}) {
  const flightPoints = Array.isArray(args.flight.flightPoints)
    ? args.flight.flightPoints
    : [];
  if (flightPoints.length === 0) {
    throw new Error("Arrival time not available");
  }

  const departurePoint = flightPoints[0];
  const arrivalPoint = flightPoints[flightPoints.length - 1];
  const departureInfo = departurePoint?.departure;
  const arrivalInfo = arrivalPoint?.arrival;

  if (!arrivalInfo) {
    throw new Error("Arrival time not available");
  }

  const departureTiming = getPreferredTiming(departureInfo?.timings, [
    "ETD",
    "ATD",
    "STD",
  ]);
  const arrivalTiming = getPreferredTiming(arrivalInfo?.timings, [
    "ETA",
    "ATA",
    "STA",
  ]);

  if (!arrivalTiming.value) {
    throw new Error("Arrival time not available");
  }

  return {
    carrier: args.carrierCode,
    flightNumber: args.normalizedFlightNumber,
    airlineCompany: args.airlineName || args.carrierCode,
    arrivalDateTimeLocal: arrivalTiming.value,
    amadeusFlightInfo: compactObject({
      carrier: args.carrierCode,
      flightNumber: args.normalizedFlightNumber,
      airlineCompany: args.airlineName || args.carrierCode,
      scheduledDepartureDate:
        firstNonEmptyString(args.flight.scheduledDepartureDate),
      departureAirportCode: firstNonEmptyString(
        departurePoint?.iataCode,
        departureInfo?.iataCode
      ),
      departureTerminal: firstNonEmptyString(
        departurePoint?.terminal,
        departureInfo?.terminal,
        departureInfo?.terminalCode,
        departurePoint?.departureTerminal
      ),
      departureDateTimeLocal: departureTiming.value,
      departureTimingSource: departureTiming.source,
      arrivalAirportCode: firstNonEmptyString(
        arrivalPoint?.iataCode,
        arrivalInfo?.iataCode
      ),
      arrivalTerminal: firstNonEmptyString(
        arrivalPoint?.terminal,
        arrivalInfo?.terminal,
        arrivalInfo?.terminalCode,
        arrivalPoint?.arrivalTerminal
      ),
      arrivalDateTimeLocal: arrivalTiming.value,
      arrivalTimingSource: arrivalTiming.source,
      aircraftCode: firstNonEmptyString(
        args.flight.legs?.[0]?.aircraftEquipment?.aircraftType,
        args.flight.legs?.[0]?.aircraftEquipment?.aircraftTypeCode,
        args.flight.legs?.[0]?.aircraftEquipment?.code
      ),
      operatingCarrierCode: firstNonEmptyString(
        args.flight.flightDesignator?.carrierCode,
        args.flight.legs?.[0]?.carrierCode,
        args.carrierCode
      ),
      rawFlightData: args.flight,
    }),
  };
}

/**
 * Query para buscar informações de chegada de um voo
 */
export const lookupFlight = query({
  args: {
    flightNumber: v.string(),
    departureDate: v.string(), // formato: yyyy-MM-dd
  },
  handler: async (ctx, args) => {
    await exigirAdmin(ctx);
    try {
      const depDate = normalizeDepartureDateInput(args.departureDate);

      // Parse do número de voo
      const parsed = parseFlightNumber(args.flightNumber);

      // Obter token OAuth
      const token = await getAmadeusToken();
      const bearer = `Bearer ${token}`;

      // Converter para IATA se necessário
      const iataCarrier = await toIataIfNeeded(bearer, parsed.carrier);

      // Buscar informações do voo
      const flightData = await getFlightInfo(bearer, iataCarrier, parsed.number, depDate);

      const data = flightData.data || [];
      if (data.length === 0) {
        throw new Error("Flight not found");
      }

      const flight = data[0];
      const airlineName = await fetchAirlineName(bearer, iataCarrier);
      return buildFlightLookupResponse({
        carrierCode: iataCarrier,
        normalizedFlightNumber: `${iataCarrier}${parsed.number}`,
        airlineName,
        flight,
      });
    } catch (error: any) {
      throw new Error(error.message || "Failed to lookup flight");
    }
  },
});

/**
 * Query para buscar nome da companhia aérea
 */
export const getAirlineName = query({
  args: {
    code: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const token = await getAmadeusToken();
      const bearer = `Bearer ${token}`;
      return await fetchAirlineName(bearer, args.code);
    } catch (error: any) {
      console.error("Failed to get airline name:", error);
      return null;
    }
  },
});

/**
 * Action para buscar informações de chegada de um voo (usado por HTTP endpoints)
 * Mesma lógica da query, mas pode ser chamada de httpAction
 */
export const lookupFlightAction = action({
  args: {
    flightNumber: v.string(),
    departureDate: v.string(), 
  },
  handler: async (ctx, args) => {
    try {
      console.log("[Flights] lookupFlightAction - Input:", {
        flightNumber: args.flightNumber,
        departureDate: args.departureDate,
      });

      // Parse do número de voo
      const parsed = parseFlightNumber(args.flightNumber);
      console.log("[Flights] Parsed flight:", parsed);

      // Obter token OAuth
      const token = await getAmadeusToken();
      const bearer = `Bearer ${token}`;

      // Converter para IATA se necessário
      let iataCarrier: string;
      try {
        iataCarrier = await toIataIfNeeded(bearer, parsed.carrier);
        console.log("[Flights] IATA carrier:", iataCarrier, "(original:", parsed.carrier, ")");
      } catch (error: any) {
        // Se falhar na conversão, tenta usar o código original (pode já ser IATA)
        console.log("[Flights] Failed to convert to IATA, using original:", parsed.carrier);
        if (parsed.carrier.length === 2) {
          iataCarrier = parsed.carrier; // Assume que já é IATA
        } else {
          throw error; // Re-throw se não conseguir converter
        }
      }

      const depDate = normalizeDepartureDateInput(args.departureDate);

      // Validar que a data não está muito no passado (mais de 1 ano) ou muito no futuro (mais de 1 ano)
      const dateObj = new Date(depDate);
      const now = new Date();
      const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      const oneYearFromNow = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
      
      if (dateObj < oneYearAgo) {
        throw new Error(`Date is too far in the past: ${depDate}. Amadeus API typically has data for dates within the last year.`);
      }
      if (dateObj > oneYearFromNow) {
        throw new Error(`Date is too far in the future: ${depDate}. Amadeus API typically has data for dates within the next year.`);
      }

      console.log("[Flights] Searching for flight:", {
        carrierCode: iataCarrier,
        flightNumber: parsed.number,
        departureDate: depDate,
      });

      // Buscar informações do voo
      const flightData = await getFlightInfo(bearer, iataCarrier, parsed.number, depDate);

      const data = flightData.data || [];
      console.log("[Flights] API response:", {
        dataLength: data.length,
        hasData: data.length > 0,
        rawResponse: JSON.stringify(flightData).substring(0, 500), // Primeiros 500 chars para debug
      });

      if (data.length === 0) {
        // Não lançar erro, apenas retornar null para que o frontend possa mostrar um toast
        console.log("[Flights] Flight not found, returning null");
        return null;
      }

      const flight = data[0];
      const airlineName = await fetchAirlineName(bearer, iataCarrier);
      return buildFlightLookupResponse({
        carrierCode: iataCarrier,
        normalizedFlightNumber: `${iataCarrier}${parsed.number}`,
        airlineName,
        flight,
      });
    } catch (error: any) {
      // A pesquisa de voo é um enriquecimento best-effort (à Welcome Pickups):
      // NUNCA deve rebentar no cliente nem bloquear a reserva. Qualquer falha —
      // não encontrado, formato inválido, companhia (ICAO) desconhecida, data
      // fora do intervalo, erro 4xx/5xx da Amadeus ou falha de OAuth — devolve
      // null. O cliente guarda à mesma o número de voo e a equipa confirma os
      // detalhes. Registamos o motivo no servidor para diagnóstico.
      console.log("[Flights] lookupFlightAction returning null:", error?.message);
      return null;
    }
  },
});
