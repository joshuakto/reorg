import { Err, type Command, type Result } from '../core/types/common';

export class ChromeMessaging {
  static async sendToBackground<T = unknown>(command: Command): Promise<Result<T>> {
    console.log('[Messaging] Sending to background:', command.type);
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(command, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[Messaging] Background error:', chrome.runtime.lastError.message);
          resolve(Err(new Error(chrome.runtime.lastError.message)));
        } else {
          console.log('[Messaging] Background response:', response);
          resolve(response as Result<T>);
        }
      });
    });
  }

  static async sendToContent<T = unknown>(tabId: number, command: Command): Promise<Result<T>> {
    console.log('[Messaging] Sending to content (tab', tabId + '):', command.type);
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, command, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[Messaging] Content error:', chrome.runtime.lastError.message);
          resolve(Err(new Error(chrome.runtime.lastError.message)));
        } else {
          console.log('[Messaging] Content response:', response);
          resolve(response as Result<T>);
        }
      });
    });
  }

  static onMessage(
    handler: (command: Command, sender: chrome.runtime.MessageSender) => Promise<unknown>,
  ): void {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      const cmd = message as Command;
      console.log('[Messaging] Message received:', cmd.type, 'from', sender.tab ? `tab ${sender.tab.id}` : 'extension');
      void handler(cmd, sender).then((response) => {
        console.log('[Messaging] Handler response:', response);
        sendResponse(response);
      });
      return true;
    });
  }
}
