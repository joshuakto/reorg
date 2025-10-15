import { Err, type Command, type Result } from '../core/types/common';

export class ChromeMessaging {
  static async sendToBackground<T = unknown>(command: Command): Promise<Result<T>> {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(command, (response) => {
        if (chrome.runtime.lastError) {
          resolve(Err(new Error(chrome.runtime.lastError.message)));
        } else {
          resolve(response as Result<T>);
        }
      });
    });
  }

  static async sendToContent<T = unknown>(tabId: number, command: Command): Promise<Result<T>> {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, command, (response) => {
        if (chrome.runtime.lastError) {
          resolve(Err(new Error(chrome.runtime.lastError.message)));
        } else {
          resolve(response as Result<T>);
        }
      });
    });
  }

  static onMessage(
    handler: (command: Command, sender: chrome.runtime.MessageSender) => Promise<unknown>,
  ): void {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      void handler(message as Command, sender).then(sendResponse);
      return true;
    });
  }
}
