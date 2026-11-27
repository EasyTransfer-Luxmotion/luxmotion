"use client"

import { useEffect, useRef } from "react"

/**
 * The checkout steps in the browser history.
 *
 * The steps lived only in React state: the phone's back gesture (or the
 * browser's Back) on step 3 left the checkout altogether, and the customer
 * landed on the page before with nothing filled in. Now each step forward is
 * a history entry and Back walks back one step. The in-page "Voltar" buttons
 * walk the history back too, so a later Back never lands on a step the
 * customer already left.
 *
 * `position` is any increasing number for "where the customer is" (step and
 * sub-step); `goTo` takes the customer there. While `locked` (the
 * confirmation page) Back is ignored: a placed order is not undone by the
 * browser.
 */
export function useCheckoutHistory(position: number, goTo: (position: number) => void, locked: boolean) {
  /* The positions of our history entries, oldest first; the last is current. */
  const stack = useRef<number[] | null>(null)
  /* A history move we started ourselves: the popstate that follows only syncs. */
  const ownMove = useRef(false)
  const goToRef = useRef(goTo)
  goToRef.current = goTo
  const lockedRef = useRef(locked)
  lockedRef.current = locked

  useEffect(() => {
    if (typeof window === "undefined") return
    const s = stack.current
    if (!s) {
      window.history.replaceState({ ...(window.history.state ?? {}), ckPos: position, ckDepth: 0 }, "")
      stack.current = [position]
      return
    }
    const current = s[s.length - 1] ?? position
    if (position === current) return
    if (position > current && !lockedRef.current) {
      s.push(position)
      window.history.pushState({ ...(window.history.state ?? {}), ckPos: position, ckDepth: s.length - 1 }, "")
      return
    }
    const idx = s.lastIndexOf(position)
    if (idx >= 0 && idx < s.length - 1 && !lockedRef.current) {
      /* Back inside the page: walk the history back to that entry. */
      const steps = s.length - 1 - idx
      s.length = idx + 1
      ownMove.current = true
      window.history.go(-steps)
      return
    }
    /* A position we have no entry for (or the confirmation): replace. */
    s[s.length - 1] = position
    window.history.replaceState({ ...(window.history.state ?? {}), ckPos: position, ckDepth: s.length - 1 }, "")
  }, [position])

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const st = e.state as { ckPos?: number; ckDepth?: number } | null
      if (ownMove.current) {
        ownMove.current = false
        return
      }
      if (typeof st?.ckPos !== "number" || !stack.current) return
      if (lockedRef.current) {
        /* Stay on the confirmation. */
        window.history.go(1)
        return
      }
      const depth = st.ckDepth ?? 0
      stack.current.length = Math.min(stack.current.length, depth + 1)
      stack.current[depth] = st.ckPos
      goToRef.current(st.ckPos)
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])
}
