/**
 * Patterns for conversational intents. Matched against the whole normalized, lower-cased
 * message without trailing punctuation, so they only fire for short, explicit replies.
 */

/** "skip", "next question", "not applicable" … — the user declines to answer the current field. */
export const SKIP_PATTERNS: readonly RegExp[] = [
  /^(?:please\s+)?(?:let['’]?s\s+)?skip(?:\s+(?:this|it|that|this one|that one|this question|that question|for now))*$/u,
  /^(?:pass|next|next question|move on|let['’]?s move on)$/u,
  /^(?:i['’]?d|i would)\s+rather\s+not(?:\s+(?:say|answer))?$/u,
  /^(?:not applicable|n\/?a|no answer|none for now)$/u,
  /^i\s+(?:can['’]?t|cannot)\s+answer(?:\s+(?:this|that|it))?(?:\s+(?:now|yet|right now))?$/u,
];

/** Confirmation of the requirements summary in the review stage. */
export const CONFIRMATION_PATTERNS: readonly RegExp[] = [
  /^(?:yes|yep|yeah|correct|confirmed?|approved?|ok|okay|fine|good|great|perfect|lgtm|proceed|go ahead)(?:[,\s]+(?:thanks|thank you|please|it is|that['’]?s (?:right|correct)))*$/u,
  /^(?:it\s+|this\s+|everything\s+|all\s+)?(?:looks|is|seems)\s+(?:good|right|fine|correct|ok|okay|complete)(?:\s+to me)?(?:[,\s]+(?:thanks|thank you))?$/u,
  /^(?:that['’]?s|that is)\s+(?:right|correct|all|it|fine)(?:[,\s]+(?:thanks|thank you))?$/u,
  /^(?:all|everything)\s+(?:good|correct)$/u,
  /^no\s+(?:changes|corrections|further changes)(?:\s+needed)?$/u,
  /^nothing\s+(?:to\s+(?:change|add|correct)|else)$/u,
  /^(?:please\s+)?(?:generate|create)\s+(?:the\s+)?(?:brd|document)(?:\s+now)?$/u,
];

/** Replies that carry no requirement information on their own. */
export const NON_ANSWER_PATTERNS: readonly RegExp[] = [
  /^(?:i\s+)?(?:don['’]?t|do not)\s+know(?:\s+(?:yet|exactly|really))?$/u,
  /^(?:i['’]?m\s+|i am\s+)?(?:not sure|unsure|uncertain)(?:\s+(?:yet|really))?$/u,
  /^(?:no idea|no clue|idk|dunno|unknown|tbd|to be defined|to be decided|not decided yet|maybe|perhaps|possibly)$/u,
  /^(?:something|anything|whatever|everything|nothing|stuff|things|it depends|depends)$/u,
  /^(?:yes|no|yep|nope|ok|okay|sure|fine|hmm+|hm+|um+|uh+|hi|hello|hey|thanks|thank you|\?+)$/u,
];

/** Openings that mark an answer as uncertain; such answers need field-specific evidence. */
export const UNCERTAIN_OPENING = /^(?:i\s+)?(?:don['’]?t|do not)\s+know\b|^(?:i['’]?m\s+|i am\s+)?not sure\b|^no idea\b|^maybe\b|^probably\b/u;

/** Phrases that announce a correction without necessarily naming a field. */
export const CORRECTION_CUE =
  /^(?:actually|correction|wait|sorry|oops|no,|that['’]?s (?:wrong|not right|incorrect)|that is (?:wrong|not right|incorrect))\b|\b(?:change|update|replace|correct)\s+(?:it|that|this|the last (?:one|answer))\b|\bmake\s+(?:it|that)\b/u;
