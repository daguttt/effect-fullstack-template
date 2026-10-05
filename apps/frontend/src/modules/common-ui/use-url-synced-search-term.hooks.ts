import { useCallback, useEffect, useRef } from 'react';

import * as Predicate from 'effect/Predicate';

import { useDebouncedText } from './use-debounced-text.hooks';

export const SEARCH_DEBOUNCE_MS = 300;

/**
 * Keeps a search field responsive while throttling what reaches the URL.
 *
 * Every distinct committed term typically opens a new backend subscription, so
 * committing per keystroke would churn through one query per character. Local
 * state drives the input; the debounced value drives the commit.
 *
 * `committedSearchTerm` is the term the route currently reads from its search
 * params; `onCommit` performs the route's navigation. The hook works for any
 * route that syncs a search box through TanStack Router search params.
 */
export function useUrlSyncedSearchTerm(
  committedSearchTerm: string,
  onCommit: (nextSearchTerm: string) => void
) {
  const { text, setText, getSettledText } = useDebouncedText(
    committedSearchTerm,
    SEARCH_DEBOUNCE_MS
  );

  // Terms this hook has pushed towards the URL that have not rendered back yet.
  //
  // `onCommit` navigates, and the router runs navigation inside a React
  // transition, so `committedSearchTerm` arrives as an echo one or more renders
  // after the commit — and continued typing can interrupt that transition for
  // longer than the debounce, leaving several commits outstanding at once.
  // Tracking only the latest would misread the earlier echoes as external
  // changes and resurrect the characters the user has since deleted, so every
  // outstanding term is kept, in order.
  const pendingCommitsRef = useRef<Array<string>>([]);
  const commit = useCallback(
    (nextSearchTerm: string) => {
      pendingCommitsRef.current.push(nextSearchTerm);
      onCommit(nextSearchTerm);
    },
    [onCommit]
  );

  // Adopt external changes to the committed term (back/forward navigation, a
  // Clear button elsewhere on the page) without fighting local typing.
  //
  // This effect must stay registered before the commit effect: adopting moves
  // the latest text, which is what makes a debounce timer for the replaced
  // text read as stale down there instead of committing the old term back.
  useEffect(() => {
    const echoIndex = pendingCommitsRef.current.indexOf(committedSearchTerm);
    if (echoIndex !== -1) {
      // Our own echo. Drop it along with any earlier commit whose render the
      // router coalesced away, so a later repeat of this term is not mistaken
      // for the one that just landed.
      pendingCommitsRef.current.splice(0, echoIndex + 1);
      return;
    }

    pendingCommitsRef.current = [];
    setText(committedSearchTerm);
  }, [committedSearchTerm, setText]);

  useEffect(() => {
    // A committed route change can render before the debounce timer catches
    // up. `getSettledText` already sees the adoption effect's `setText` from
    // this same pass, so that stale value reads as null instead of being
    // written back into the URL.
    const settledText = getSettledText();
    if (Predicate.isNull(settledText)) return;

    const trimmed = settledText.trim();
    // The term the URL holds, or the last one on its way there — while commits
    // are in flight the prop still holds an earlier term, and re-sending a term
    // that is already on its way would only churn the router and the query.
    const target = pendingCommitsRef.current.at(-1) ?? committedSearchTerm;
    if (trimmed === target) return;

    commit(trimmed);
  }, [getSettledText, committedSearchTerm, commit]);

  return {
    text,
    setText,
    // Clearing bypasses the debounce. The intent is already complete, so there
    // is nothing to wait for — and the empty term switches the page back to
    // browse mode, which should feel instant. The later debounce settle at ''
    // dedups against this commit instead of re-sending it.
    clear: () => {
      setText('');
      commit('');
    },
  };
}
