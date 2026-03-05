/**
 * Topic Shift Detector (Phase 0.5)
 *
 * Compares the previous intent category with the current one to detect
 * when the user switches topics mid-conversation.
 *
 * Zero LLM cost: uses the intent categories already computed by the
 * semantic classifier (no extra API call needed).
 *
 * Returns:
 *   { isTopicShift: boolean, label: 'NEW_TOPIC'|'SAME_TOPIC', prevCategory, currCategory }
 */

// Categories that represent a meaningful "domain".
// Shifts between these domains are considered topic shifts.
const DOMAIN_CATEGORIES = new Set([
    'descriptive',
    'diagnostic',
    'predictive',
    'recommendation',
    'visualization',
    'maps',
    'policy',
]);

/**
 * Detect whether the user has shifted to a different topic.
 *
 * @param {string|null} prevCategory - Intent category from the PREVIOUS turn (null on first message)
 * @param {string}      currCategory - Intent category from the CURRENT turn
 * @returns {{ isTopicShift: boolean, label: string, prevCategory: string|null, currCategory: string }}
 */
export function detectTopicShift(prevCategory, currCategory) {
    // No previous category → first message in session, not a shift
    if (!prevCategory) {
        return {
            isTopicShift: false,
            label: 'SAME_TOPIC',
            prevCategory: null,
            currCategory,
        };
    }

    // If either side is 'general', it's not a meaningful domain shift
    // (greetings / small talk don't represent a topic we need to track)
    const prevIsDomain = DOMAIN_CATEGORIES.has(prevCategory);
    const currIsDomain = DOMAIN_CATEGORIES.has(currCategory);

    if (!prevIsDomain || !currIsDomain) {
        return {
            isTopicShift: false,
            label: 'SAME_TOPIC',
            prevCategory,
            currCategory,
        };
    }

    // Both are meaningful domains — shift if the domain changed
    const shifted = prevCategory !== currCategory;

    return {
        isTopicShift: shifted,
        label: shifted ? 'NEW_TOPIC' : 'SAME_TOPIC',
        prevCategory,
        currCategory,
    };
}

export default { detectTopicShift };
