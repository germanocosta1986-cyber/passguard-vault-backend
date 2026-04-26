-- CreateTable
CREATE TABLE "NotificationClick" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationClick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationClick_notificationId_idx" ON "NotificationClick"("notificationId");

-- AddForeignKey
ALTER TABLE "NotificationClick" ADD CONSTRAINT "NotificationClick_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationClick" ADD CONSTRAINT "NotificationClick_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
