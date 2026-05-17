export function notifyError(error, context, metadata) {
  console.error(`[${context}]`, error, metadata || '');
}
