/**
 * Apply bubble selection deletes to paired chat turns.
 * - Selecting a user bubble removes the whole turn.
 * - Selecting only an answer bubble clears that answer.
 */
export function applyBubbleDeletes(messages = [], selectedBubbleIds = [], idFns = {}) {
  const selected = new Set(selectedBubbleIds);
  const userIdOf = idFns.userId || ((message) => `${message.id}-user`);
  const answerIdOf = idFns.answerId || ((message) => `${message.id}-answer`);

  const next = [];
  const removedMessageIds = [];

  for (const message of messages) {
    const userId = userIdOf(message);
    const answerId = answerIdOf(message);
    const dropUser = selected.has(userId);
    const dropAnswer = selected.has(answerId);

    if (dropUser) {
      if (message.userMessageId) removedMessageIds.push(message.userMessageId);
      if (message.id && message.id !== message.userMessageId) removedMessageIds.push(message.id);
      continue;
    }

    if (dropAnswer) {
      if (message.id) removedMessageIds.push(message.id);
      next.push({
        ...message,
        answer: '',
        citations: [],
        failed: false,
      });
      continue;
    }

    next.push(message);
  }

  return {
    messages: next,
    removedMessageIds: [...new Set(removedMessageIds.filter(Boolean))],
  };
}
