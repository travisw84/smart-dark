// Dark Reader's API wraps runtime.sendMessage without returning its Promise.
// Capture Chrome's real implementation before evaluating that optional engine.
export const sendMessage = chrome.runtime.sendMessage.bind(chrome.runtime);
