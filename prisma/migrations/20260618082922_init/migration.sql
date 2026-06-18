-- CreateTable
CREATE TABLE `AdminUser` (
    `id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(64) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `role` VARCHAR(32) NOT NULL DEFAULT 'admin',
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AdminUser_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiSetting` (
    `id` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(32) NOT NULL DEFAULT 'deepseek',
    `baseUrl` VARCHAR(512) NOT NULL,
    `apiKeyEncrypted` TEXT NOT NULL,
    `model` VARCHAR(128) NOT NULL,
    `temperature` DOUBLE NOT NULL DEFAULT 0.3,
    `maxTokens` INTEGER NOT NULL DEFAULT 4096,
    `timeoutMs` INTEGER NOT NULL DEFAULT 60000,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PromptTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `type` VARCHAR(32) NOT NULL,
    `content` LONGTEXT NOT NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SystemSetting` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(128) NOT NULL,
    `value` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SystemSetting_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SparkReport` (
    `id` VARCHAR(191) NOT NULL,
    `sparkCode` VARCHAR(128) NOT NULL,
    `sparkUrl` VARCHAR(512) NOT NULL,
    `reportType` VARCHAR(32) NOT NULL DEFAULT 'unknown',
    `status` VARCHAR(32) NOT NULL DEFAULT 'pending',
    `progress` INTEGER NOT NULL DEFAULT 0,
    `stage` VARCHAR(64) NULL,
    `platform` VARCHAR(64) NULL,
    `minecraftVersion` VARCHAR(32) NULL,
    `sparkVersion` VARCHAR(32) NULL,
    `serverBrand` VARCHAR(128) NULL,
    `durationSeconds` INTEGER NULL,
    `rawMetadataJson` LONGTEXT NULL,
    `normalizedJson` LONGTEXT NULL,
    `ruleAnalysisJson` LONGTEXT NULL,
    `errorCode` VARCHAR(64) NULL,
    `errorMessage` VARCHAR(512) NULL,
    `errorDetailJson` TEXT NULL,
    `clientIpHash` VARCHAR(128) NOT NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `lockedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `expiresAt` DATETIME(3) NULL,

    INDEX `SparkReport_sparkCode_idx`(`sparkCode`),
    INDEX `SparkReport_sparkCode_status_createdAt_idx`(`sparkCode`, `status`, `createdAt`),
    INDEX `SparkReport_status_idx`(`status`),
    INDEX `SparkReport_clientIpHash_createdAt_idx`(`clientIpHash`, `createdAt`),
    INDEX `SparkReport_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AnalysisResult` (
    `id` VARCHAR(191) NOT NULL,
    `reportId` VARCHAR(191) NOT NULL,
    `severity` VARCHAR(32) NULL,
    `summary` VARCHAR(512) NULL,
    `aiResultJson` LONGTEXT NULL,
    `markdownReport` LONGTEXT NULL,
    `isFallback` BOOLEAN NOT NULL DEFAULT false,
    `model` VARCHAR(128) NULL,
    `promptTemplateId` VARCHAR(64) NULL,
    `promptVersion` INTEGER NULL,
    `inputTokens` INTEGER NULL,
    `outputTokens` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AnalysisResult_reportId_key`(`reportId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SystemLog` (
    `id` VARCHAR(191) NOT NULL,
    `level` VARCHAR(16) NOT NULL,
    `module` VARCHAR(64) NOT NULL,
    `message` TEXT NOT NULL,
    `contextJson` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SystemLog_level_createdAt_idx`(`level`, `createdAt`),
    INDEX `SystemLog_module_createdAt_idx`(`module`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdminAuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `adminUserId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(64) NOT NULL,
    `targetType` VARCHAR(64) NULL,
    `targetId` VARCHAR(64) NULL,
    `detailJson` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AdminAuditLog_adminUserId_createdAt_idx`(`adminUserId`, `createdAt`),
    INDEX `AdminAuditLog_action_createdAt_idx`(`action`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AnalysisResult` ADD CONSTRAINT `AnalysisResult_reportId_fkey` FOREIGN KEY (`reportId`) REFERENCES `SparkReport`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AdminAuditLog` ADD CONSTRAINT `AdminAuditLog_adminUserId_fkey` FOREIGN KEY (`adminUserId`) REFERENCES `AdminUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
