export type NotificationSender = (
  recipient: string,
  message: string
) => Promise<void>;

let sender: NotificationSender = async () => {
  // Výchozí implementace pro současný prototyp:
  // doručení považujeme za úspěšné.
};

export function setNotificationSender(
  newSender: NotificationSender
): void {
  sender = newSender;
}

export function resetNotificationSender(): void {
  sender = async () => {};
}

export async function sendNotification(
  recipient: string,
  message: string
): Promise<void> {
  await sender(recipient, message);
}