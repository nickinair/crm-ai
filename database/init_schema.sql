-- ============================================================
-- 车和网 CRM 销售系统 — 数据库 DDL 脚本
-- 版本: V1.0.0
-- 数据库: MySQL 8.0+
-- 字符集: utf8mb4 / utf8mb4_general_ci
-- 创建日期: 2026-07-07
-- ============================================================

-- 创建数据库
CREATE DATABASE IF NOT EXISTS `crm_sales`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_general_ci;

USE `crm_sales`;

-- ============================================================
-- 一、基础建设层
-- ============================================================

-- ------------------------------------------------------------
-- 1.1 组织表
-- ------------------------------------------------------------
CREATE TABLE `sys_organization` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '组织ID',
  `parent_id`  BIGINT UNSIGNED     NULL DEFAULT NULL   COMMENT '父级组织ID，顶级为NULL',
  `org_name`   VARCHAR(60)     NOT NULL                COMMENT '组织名称（≤30中文字符）',
  `org_code`   VARCHAR(32)     NOT NULL                COMMENT '组织编码',
  `org_level`  TINYINT UNSIGNED NOT NULL               COMMENT '组织层级（1=顶级）',
  `org_path`   VARCHAR(512)    NOT NULL                COMMENT '全路径，如 /1/3/7/ 用于快速祖先查询',
  `status`     TINYINT         NOT NULL DEFAULT 1      COMMENT '1=启用, 0=禁用',
  `sort_order` INT             NOT NULL DEFAULT 0      COMMENT '同级排序',
  `created_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME            NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_org_code` (`org_code`),
  KEY `idx_parent_id` (`parent_id`),
  KEY `idx_org_path` (`org_path`(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='组织架构表';

-- ------------------------------------------------------------
-- 1.2 账号表
-- ------------------------------------------------------------
CREATE TABLE `sys_account` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '账号ID',
  `account_code`  VARCHAR(16)     NOT NULL                COMMENT '账号编码 ACC_00001',
  `username`      VARCHAR(20)     NOT NULL                COMMENT '账号（工号），英文+数字≤10位',
  `password_hash` VARCHAR(128)    NOT NULL                COMMENT '密码 bcrypt 哈希',
  `real_name`     VARCHAR(60)     NOT NULL                COMMENT '员工真实姓名',
  `phone`         VARCHAR(128)    NOT NULL                COMMENT '手机号（AES加密存储）',
  `phone_hash`    VARCHAR(64)     NOT NULL                COMMENT '手机号 SHA256 摘要，用于唯一校验',
  `status`        TINYINT         NOT NULL DEFAULT 1      COMMENT '1=正常, 0=禁用, 2=已离职',
  `last_login_at` DATETIME            NULL DEFAULT NULL   COMMENT '最后登录时间',
  `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at`    DATETIME            NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_account_code` (`account_code`),
  UNIQUE KEY `uk_username` (`username`),
  UNIQUE KEY `uk_phone_hash` (`phone_hash`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='账号表';

-- ------------------------------------------------------------
-- 1.3 账号-组织关系表
-- ------------------------------------------------------------
CREATE TABLE `sys_account_org` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `account_id` BIGINT UNSIGNED NOT NULL COMMENT '账号ID',
  `org_id`     BIGINT UNSIGNED NOT NULL COMMENT '组织ID',
  `created_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_account_org` (`account_id`, `org_id`),
  KEY `idx_org_id` (`org_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='账号-组织关系表';

-- ------------------------------------------------------------
-- 1.4 角色表
-- ------------------------------------------------------------
CREATE TABLE `sys_role` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '角色ID',
  `role_name`  VARCHAR(60)     NOT NULL                COMMENT '角色名称',
  `role_code`  VARCHAR(32)     NOT NULL                COMMENT '角色编码',
  `status`     TINYINT         NOT NULL DEFAULT 1      COMMENT '1=启用, 0=停用',
  `remark`     VARCHAR(200)        NULL DEFAULT NULL   COMMENT '角色说明（≤100中文字符）',
  `created_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME            NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_name` (`role_name`),
  UNIQUE KEY `uk_role_code` (`role_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='角色表';

-- ------------------------------------------------------------
-- 1.5 账号-角色关系表
-- ------------------------------------------------------------
CREATE TABLE `sys_account_role` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `account_id` BIGINT UNSIGNED NOT NULL COMMENT '账号ID',
  `role_id`    BIGINT UNSIGNED NOT NULL COMMENT '角色ID',
  `created_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_account_role` (`account_id`, `role_id`),
  KEY `idx_role_id` (`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='账号-角色关系表';

-- ------------------------------------------------------------
-- 1.6 权限表
-- ------------------------------------------------------------
CREATE TABLE `sys_permission` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `parent_id`  BIGINT UNSIGNED     NULL DEFAULT NULL   COMMENT '父权限ID',
  `perm_name`  VARCHAR(60)     NOT NULL                COMMENT '权限名称',
  `perm_code`  VARCHAR(64)     NOT NULL                COMMENT '权限编码（如 lead:pool:edit）',
  `perm_type`  TINYINT         NOT NULL                COMMENT '1=菜单, 2=按钮/操作, 3=数据',
  `path`       VARCHAR(256)        NULL DEFAULT NULL   COMMENT '前端路由路径',
  `icon`       VARCHAR(64)         NULL DEFAULT NULL   COMMENT '菜单图标',
  `sort_order` INT             NOT NULL DEFAULT 0      COMMENT '排序',
  `status`     TINYINT         NOT NULL DEFAULT 1      COMMENT '1=启用, 0=停用',
  `created_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_perm_code` (`perm_code`),
  KEY `idx_parent_id` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='权限表';

-- ------------------------------------------------------------
-- 1.7 角色-权限关系表
-- ------------------------------------------------------------
CREATE TABLE `sys_role_permission` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `role_id`       BIGINT UNSIGNED NOT NULL COMMENT '角色ID',
  `permission_id` BIGINT UNSIGNED NOT NULL COMMENT '权限ID',
  `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_perm` (`role_id`, `permission_id`),
  KEY `idx_permission_id` (`permission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='角色-权限关系表';

-- ------------------------------------------------------------
-- 1.8 数据字典类型表
-- ------------------------------------------------------------
CREATE TABLE `sys_dict_type` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `dict_type_code` VARCHAR(64)     NOT NULL COMMENT '字典类型编码',
  `dict_type_name` VARCHAR(60)     NOT NULL COMMENT '字典类型名称',
  `status`         TINYINT         NOT NULL DEFAULT 1 COMMENT '1=启用, 0=停用',
  `remark`         VARCHAR(200)        NULL DEFAULT NULL,
  `created_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dict_type_code` (`dict_type_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='数据字典类型表';

-- ------------------------------------------------------------
-- 1.9 数据字典项表
-- ------------------------------------------------------------
CREATE TABLE `sys_dict_item` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `dict_type_id` BIGINT UNSIGNED NOT NULL COMMENT '所属字典类型ID',
  `item_code`    VARCHAR(64)     NOT NULL COMMENT '字典项编码',
  `item_label`   VARCHAR(120)    NOT NULL COMMENT '显示名称',
  `item_value`   VARCHAR(120)    NOT NULL COMMENT '存储值',
  `sort_order`   INT             NOT NULL DEFAULT 0,
  `status`       TINYINT         NOT NULL DEFAULT 1,
  `created_at`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_type_item_code` (`dict_type_id`, `item_code`),
  KEY `idx_dict_type_id` (`dict_type_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='数据字典项表';

-- ------------------------------------------------------------
-- 1.10 操作日志表
-- ------------------------------------------------------------
CREATE TABLE `sys_operation_log` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `account_id`  BIGINT UNSIGNED NOT NULL                COMMENT '操作人ID',
  `module`      VARCHAR(32)     NOT NULL                COMMENT '模块名（lead/customer/order...）',
  `action`      VARCHAR(32)     NOT NULL                COMMENT '操作类型（create/update/delete/import/export）',
  `target_type` VARCHAR(32)         NULL DEFAULT NULL   COMMENT '操作对象类型',
  `target_id`   BIGINT UNSIGNED     NULL DEFAULT NULL   COMMENT '操作对象ID',
  `detail`      JSON                NULL DEFAULT NULL   COMMENT '操作详情（变更前后 diff）',
  `ip`          VARCHAR(45)         NULL DEFAULT NULL   COMMENT '操作IP',
  `user_agent`  VARCHAR(256)        NULL DEFAULT NULL,
  `created_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_account_id` (`account_id`),
  KEY `idx_module_action` (`module`, `action`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='操作日志表';


-- ============================================================
-- 二、核心业务层
-- ============================================================

-- ------------------------------------------------------------
-- 2.1 客户表
-- ------------------------------------------------------------
CREATE TABLE `biz_customer` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '客户ID',
  `customer_name`   VARCHAR(60)     NOT NULL                COMMENT '客户姓名',
  `id_card_no`      VARCHAR(128)        NULL DEFAULT NULL   COMMENT '身份证号（AES加密存储）',
  `id_card_hash`    VARCHAR(64)         NULL DEFAULT NULL   COMMENT '身份证号 SHA256 摘要',
  `phone`           VARCHAR(128)    NOT NULL                COMMENT '电话号码（AES加密存储）',
  `phone_hash`      VARCHAR(64)     NOT NULL                COMMENT '电话号码 SHA256 摘要',
  `gender`          TINYINT             NULL DEFAULT 0      COMMENT '0=未知, 1=男, 2=女',
  `birthday`        DATE                NULL DEFAULT NULL   COMMENT '生日',
  `customer_tags`   VARCHAR(512)        NULL DEFAULT NULL   COMMENT '客户标签（JSON）',
  `customer_source` VARCHAR(32)         NULL DEFAULT NULL   COMMENT '客户来源',
  `status`          TINYINT         NOT NULL DEFAULT 1      COMMENT '1=正常, 0=冻结',
  `remark`          TEXT                NULL DEFAULT NULL   COMMENT '备注',
  `created_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME            NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_phone_hash` (`phone_hash`),
  UNIQUE KEY `uk_id_card_hash` (`id_card_hash`),
  KEY `idx_customer_name` (`customer_name`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='客户表';

-- ------------------------------------------------------------
-- 2.2 车辆信息表
-- ------------------------------------------------------------
CREATE TABLE `biz_vehicle` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `customer_id`    BIGINT UNSIGNED NOT NULL                COMMENT '所属客户ID',
  `brand`          VARCHAR(60)         NULL DEFAULT NULL   COMMENT '品牌',
  `plate_no`       VARCHAR(20)         NULL DEFAULT NULL   COMMENT '车牌号',
  `model`          VARCHAR(60)         NULL DEFAULT NULL   COMMENT '车型款式',
  `vin`            VARCHAR(17)         NULL DEFAULT NULL   COMMENT '车架号(VIN)',
  `purchase_date`  DATE                NULL DEFAULT NULL   COMMENT '购车日期',
  `mileage`        INT UNSIGNED    NOT NULL DEFAULT 0      COMMENT '当前公里数',
  `vehicle_status` TINYINT         NOT NULL DEFAULT 1      COMMENT '1=正常, 0=已报废',
  `remark`         VARCHAR(512)        NULL DEFAULT NULL   COMMENT '备注',
  `created_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME            NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_vin` (`vin`),
  KEY `idx_customer_id` (`customer_id`),
  KEY `idx_plate_no` (`plate_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='车辆信息表';

-- ------------------------------------------------------------
-- 2.3 线索表
-- ------------------------------------------------------------
CREATE TABLE `biz_lead` (
  `id`                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `lead_code`               VARCHAR(32)     NOT NULL                COMMENT '线索编码',
  `customer_id`             BIGINT UNSIGNED     NULL DEFAULT NULL   COMMENT '关联客户ID',
  `vehicle_id`              BIGINT UNSIGNED     NULL DEFAULT NULL   COMMENT '关联车辆ID',
  `channel_source`          VARCHAR(32)     NOT NULL                COMMENT '渠道来源（字典code）',
  `source_method`           VARCHAR(32)         NULL DEFAULT NULL   COMMENT '线索来源方式（字典code）',
  `source_date`             DATE                NULL DEFAULT NULL   COMMENT '来源日期',
  `is_add_wechat`           VARCHAR(32)         NULL DEFAULT NULL   COMMENT '添加微信状态（字典code）',
  `purchase_intention`      VARCHAR(32)         NULL DEFAULT NULL   COMMENT '购买意向（字典code）',
  `communication_tendency`  VARCHAR(32)         NULL DEFAULT NULL   COMMENT '客户沟通倾向（字典code）',
  `call_result`             VARCHAR(32)         NULL DEFAULT NULL   COMMENT '最近呼叫结果',
  `lead_status`             TINYINT         NOT NULL DEFAULT 0      COMMENT '0=待分配,1=待跟进,2=跟进中,3=已完成,4=已战败,5=已作废,6=回收待分配',
  `assigned_account_id`     BIGINT UNSIGNED     NULL DEFAULT NULL   COMMENT '当前负责销售ID',
  `assigned_at`             DATETIME            NULL DEFAULT NULL   COMMENT '分配时间',
  `last_follow_at`          DATETIME            NULL DEFAULT NULL   COMMENT '最新跟进时间',
  `next_recycle_at`         DATETIME            NULL DEFAULT NULL   COMMENT '下次回收时间（超时回收用）',
  `parent_lead_id`          BIGINT UNSIGNED     NULL DEFAULT NULL   COMMENT '派生来源的父线索ID（如战败再分配时记录原战败线索ID）',
  `order_id`                BIGINT UNSIGNED     NULL DEFAULT NULL   COMMENT '关联订单ID',
  `remark`                  TEXT                NULL DEFAULT NULL   COMMENT '备注',
  `created_at`              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`              DATETIME            NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_lead_code` (`lead_code`),
  KEY `idx_customer_id` (`customer_id`),
  KEY `idx_vehicle_id` (`vehicle_id`),
  KEY `idx_assigned_account` (`assigned_account_id`),
  KEY `idx_lead_status` (`lead_status`),
  KEY `idx_channel_source` (`channel_source`),
  KEY `idx_next_recycle` (`next_recycle_at`),
  KEY `idx_last_follow` (`last_follow_at`),
  KEY `idx_order_id` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='线索表';

-- ------------------------------------------------------------
-- 2.4 线索-意向商品关系表
-- ------------------------------------------------------------
CREATE TABLE `biz_lead_product` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `lead_id`      BIGINT UNSIGNED NOT NULL COMMENT '线索ID',
  `product_id`   BIGINT UNSIGNED NOT NULL COMMENT '商品ID',
  `product_role` TINYINT         NOT NULL DEFAULT 1 COMMENT '1=意向商品, 2=意向赠品',
  `created_at`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_lead_product_role` (`lead_id`, `product_id`, `product_role`),
  KEY `idx_product_id` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='线索-意向商品关系表';

-- ------------------------------------------------------------
-- 2.5 线索导入临时表（批量导入警告数据暂存）
-- ------------------------------------------------------------
CREATE TABLE `biz_lead_import_temp` (
  `id`                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `batch_no`              VARCHAR(32)     NOT NULL                COMMENT '导入批次号',
  `raw_data`              JSON            NOT NULL                COMMENT '原始导入行数据',
  `warn_type`             VARCHAR(32)     NOT NULL                COMMENT '警告类型（customer_warn/vehicle_warn）',
  `warn_detail`           VARCHAR(512)        NULL DEFAULT NULL   COMMENT '警告描述',
  `conflict_customer_id`  BIGINT UNSIGNED     NULL DEFAULT NULL   COMMENT '冲突的系统客户ID',
  `conflict_vehicle_id`   BIGINT UNSIGNED     NULL DEFAULT NULL   COMMENT '冲突的系统车辆ID',
  `resolve_status`        TINYINT         NOT NULL DEFAULT 0      COMMENT '0=待处理, 1=已处理',
  `resolve_action`        VARCHAR(32)         NULL DEFAULT NULL   COMMENT '处理动作（use_system/update_system/new_customer）',
  `resolved_by`           BIGINT UNSIGNED     NULL DEFAULT NULL   COMMENT '处理人ID',
  `resolved_at`           DATETIME            NULL DEFAULT NULL   COMMENT '处理时间',
  `created_at`            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_batch_no` (`batch_no`),
  KEY `idx_resolve_status` (`resolve_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='线索导入临时表';

-- ------------------------------------------------------------
-- 2.6 实物商品表
-- ------------------------------------------------------------
CREATE TABLE `biz_product` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `product_code`  VARCHAR(32)     NOT NULL                COMMENT '商品编码',
  `product_type`  VARCHAR(32)     NOT NULL                COMMENT '商品类型（charging_pile/warranty/boutique）',
  `product_name`  VARCHAR(120)    NOT NULL                COMMENT '商品名称',
  `product_model` VARCHAR(120)        NULL DEFAULT NULL   COMMENT '商品型号/规格',
  `spec_params`   JSON                NULL DEFAULT NULL   COMMENT '规格参数（KV对）',
  `unit`          VARCHAR(10)     NOT NULL DEFAULT '个'   COMMENT '单位（个/套）',
  `cost_price`    DECIMAL(12,2)   NOT NULL DEFAULT 0.00   COMMENT '成本价',
  `sale_price`    DECIMAL(12,2)   NOT NULL DEFAULT 0.00   COMMENT '售价',
  `status`        TINYINT         NOT NULL DEFAULT 1      COMMENT '1=生效中, 0=已归档',
  `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME            NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_product_code` (`product_code`),
  KEY `idx_product_type` (`product_type`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='实物商品表';

-- ------------------------------------------------------------
-- 2.7 券商品表
-- ------------------------------------------------------------
CREATE TABLE `biz_coupon` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `coupon_name`   VARCHAR(120)    NOT NULL                COMMENT '券名称',
  `coupon_type`   VARCHAR(32)     NOT NULL                COMMENT '券类型',
  `coupon_code`   VARCHAR(64)     NOT NULL                COMMENT '券码',
  `face_value`    DECIMAL(12,2)   NOT NULL DEFAULT 0.00   COMMENT '面额',
  `validity_days` INT                 NULL DEFAULT NULL   COMMENT '有效期天数',
  `source`        VARCHAR(120)        NULL DEFAULT NULL   COMMENT '来源',
  `status`        TINYINT         NOT NULL DEFAULT 1      COMMENT '1=可用, 0=已过期, 2=已使用',
  `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME            NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_coupon_code` (`coupon_code`),
  KEY `idx_coupon_type` (`coupon_type`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='券商品表';

-- ------------------------------------------------------------
-- 2.8 订单表
-- ------------------------------------------------------------
CREATE TABLE `biz_order` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_code`      VARCHAR(32)     NOT NULL                COMMENT '订单编号',
  `customer_id`     BIGINT UNSIGNED NOT NULL                COMMENT '客户ID',
  `lead_id`         BIGINT UNSIGNED     NULL DEFAULT NULL   COMMENT '关联线索ID',
  `channel_source`  VARCHAR(32)         NULL DEFAULT NULL   COMMENT '渠道来源',
  `payment_method`  VARCHAR(32)         NULL DEFAULT NULL   COMMENT '支付方式',
  `total_amount`    DECIMAL(12,2)   NOT NULL DEFAULT 0.00   COMMENT '订单总金额',
  `order_status`    TINYINT         NOT NULL DEFAULT 0      COMMENT '0=待确认,1=已确认,2=已完成,3=已取消',
  `order_platform`  VARCHAR(32)         NULL DEFAULT NULL   COMMENT '下单平台（抖音/天猫/京东）',
  `salesperson_id`  BIGINT UNSIGNED     NULL DEFAULT NULL   COMMENT '成交销售ID',
  `remark`          TEXT                NULL DEFAULT NULL,
  `created_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME            NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_code` (`order_code`),
  KEY `idx_customer_id` (`customer_id`),
  KEY `idx_lead_id` (`lead_id`),
  KEY `idx_salesperson_id` (`salesperson_id`),
  KEY `idx_order_status` (`order_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='订单表';

-- ------------------------------------------------------------
-- 2.9 订单明细表
-- ------------------------------------------------------------
CREATE TABLE `biz_order_item` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id`      BIGINT UNSIGNED NOT NULL                COMMENT '订单ID',
  `product_id`    BIGINT UNSIGNED     NULL DEFAULT NULL   COMMENT '商品ID',
  `product_role`  TINYINT         NOT NULL DEFAULT 1      COMMENT '1=商品, 2=赠品',
  `product_name`  VARCHAR(120)    NOT NULL                COMMENT '商品名称（冗余快照）',
  `product_model` VARCHAR(120)        NULL DEFAULT NULL   COMMENT '商品型号（冗余快照）',
  `unit_price`    DECIMAL(12,2)   NOT NULL DEFAULT 0.00   COMMENT '成交单价',
  `quantity`      INT             NOT NULL DEFAULT 1      COMMENT '数量',
  `subtotal`      DECIMAL(12,2)   NOT NULL DEFAULT 0.00   COMMENT '小计',
  `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_order_id` (`order_id`),
  KEY `idx_product_id` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='订单明细表';

-- ------------------------------------------------------------
-- 2.10 跟进记录表
-- ------------------------------------------------------------
CREATE TABLE `biz_follow_record` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `lead_id`        BIGINT UNSIGNED NOT NULL                COMMENT '关联线索ID',
  `customer_id`    BIGINT UNSIGNED     NULL DEFAULT NULL   COMMENT '关联客户ID',
  `account_id`     BIGINT UNSIGNED NOT NULL                COMMENT '跟进人（销售）ID',
  `follow_type`    TINYINT         NOT NULL                COMMENT '1=新增线索,2=跟进线索,3=跟进中添加信息,4=创建订单',
  `follow_content` TEXT                NULL DEFAULT NULL   COMMENT '跟进内容',
  `follow_time`    DATETIME        NOT NULL                COMMENT '跟进时间',
  `call_result`    VARCHAR(32)         NULL DEFAULT NULL   COMMENT '呼叫结果',
  `created_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_lead_id` (`lead_id`),
  KEY `idx_customer_id` (`customer_id`),
  KEY `idx_account_id` (`account_id`),
  KEY `idx_follow_time` (`follow_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='跟进记录表';

-- ------------------------------------------------------------
-- 2.11 私域关系表（客户-销售绑定）
-- ------------------------------------------------------------
CREATE TABLE `biz_private_relation` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `customer_id`      BIGINT UNSIGNED NOT NULL COMMENT '客户ID',
  `account_id`       BIGINT UNSIGNED NOT NULL COMMENT '关联销售ID',
  `first_bindtime`   DATETIME            NULL DEFAULT NULL COMMENT '首次关联时间',
  `status`           TINYINT         NOT NULL DEFAULT 1    COMMENT '1=有效, 0=已解除',
  `is_wechat_added`  TINYINT         NOT NULL DEFAULT 0    COMMENT '是否已加微信 0=否,1=是',
  `sales_remark`     VARCHAR(512)        NULL DEFAULT NULL  COMMENT '销售备注信息',
  `created_at`       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME            NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cust_account` (`customer_id`, `account_id`),
  KEY `idx_account_id` (`account_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='私域关系表';

-- ------------------------------------------------------------
-- 2.12 客户备注表
-- ------------------------------------------------------------
CREATE TABLE `biz_customer_note` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `customer_id`  BIGINT UNSIGNED NOT NULL COMMENT '客户ID',
  `note_content` TEXT            NOT NULL COMMENT '备注内容',
  `created_by`   BIGINT UNSIGNED NOT NULL COMMENT '创建人ID',
  `created_at`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_customer_id` (`customer_id`),
  KEY `idx_created_by` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='客户备注表';


-- ============================================================
-- 三、预留扩展层（第二~四阶段，先建表留结构）
-- ============================================================

-- ------------------------------------------------------------
-- 3.1 日程表
-- ------------------------------------------------------------
CREATE TABLE `biz_schedule` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `account_id`    BIGINT UNSIGNED NOT NULL COMMENT '关联销售',
  `customer_id`   BIGINT UNSIGNED     NULL DEFAULT NULL COMMENT '关联客户',
  `lead_id`       BIGINT UNSIGNED     NULL DEFAULT NULL COMMENT '关联线索',
  `schedule_time` DATETIME        NOT NULL COMMENT '日程时间',
  `schedule_type` TINYINT         NOT NULL COMMENT '1=到店接待,2=电话预约,3=其他',
  `content`       VARCHAR(512)        NULL DEFAULT NULL COMMENT '日程内容',
  `status`        TINYINT         NOT NULL DEFAULT 0 COMMENT '0=待执行,1=已完成,2=已取消',
  `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME            NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_account_id` (`account_id`),
  KEY `idx_schedule_time` (`schedule_time`),
  KEY `idx_customer_id` (`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='日程表（预留）';

-- ------------------------------------------------------------
-- 3.2 任务表
-- ------------------------------------------------------------
CREATE TABLE `biz_task` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `account_id`  BIGINT UNSIGNED NOT NULL COMMENT '关联销售',
  `customer_id` BIGINT UNSIGNED NOT NULL COMMENT '关联客户',
  `task_type`   VARCHAR(32)     NOT NULL COMMENT '任务类型',
  `remind_date` DATE            NOT NULL COMMENT '提醒日期',
  `content`     VARCHAR(512)        NULL DEFAULT NULL COMMENT '任务内容',
  `status`      TINYINT         NOT NULL DEFAULT 0 COMMENT '0=待执行,1=已完成,2=已取消',
  `created_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME            NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_account_id` (`account_id`),
  KEY `idx_customer_id` (`customer_id`),
  KEY `idx_remind_date` (`remind_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='任务表（预留）';

-- ------------------------------------------------------------
-- 3.3 消息/预警表
-- ------------------------------------------------------------
CREATE TABLE `biz_message` (
  `id`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `msg_category`        TINYINT         NOT NULL COMMENT '1=客户预警,2=客户通知,3=系统通知,4=系统预警',
  `msg_type`            VARCHAR(32)     NOT NULL COMMENT '消息子类型',
  `title`               VARCHAR(120)    NOT NULL COMMENT '标题',
  `content`             TEXT                NULL DEFAULT NULL COMMENT '内容',
  `target_account_id`   BIGINT UNSIGNED     NULL DEFAULT NULL COMMENT '目标接收人',
  `related_customer_id` BIGINT UNSIGNED     NULL DEFAULT NULL COMMENT '关联客户',
  `related_lead_id`     BIGINT UNSIGNED     NULL DEFAULT NULL COMMENT '关联线索',
  `is_read`             TINYINT         NOT NULL DEFAULT 0 COMMENT '是否已读 0=否,1=是',
  `is_resolved`         TINYINT         NOT NULL DEFAULT 0 COMMENT '是否已处理（预警用）',
  `resolved_at`         DATETIME            NULL DEFAULT NULL,
  `created_at`          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_target_account` (`target_account_id`),
  KEY `idx_msg_category` (`msg_category`),
  KEY `idx_is_read` (`is_read`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='消息/预警表（预留）';


-- ============================================================
-- 四、预置基础数据
-- ============================================================

-- 4.1 预置数据字典类型
INSERT INTO `sys_dict_type` (`dict_type_code`, `dict_type_name`, `remark`) VALUES
  ('channel_source',          '渠道来源',       '线索渠道来源，如赛力斯、直播间等'),
  ('lead_source_method',      '线索来源方式',   '线索获取方式'),
  ('wechat_add_status',       '添加微信进度',   '客户添加微信的状态'),
  ('purchase_intention',      '购买意向',       '客户购买意向程度'),
  ('communication_tendency',  '客户沟通倾向',   '客户沟通偏好'),
  ('call_result',             '呼叫结果',       '外呼/通话结果'),
  ('product_type',            '商品类型',       '实物商品类型分类'),
  ('order_platform',          '下单平台',       '客户下单的电商平台');

-- 4.2 预置渠道来源
INSERT INTO `sys_dict_item` (`dict_type_id`, `item_code`, `item_label`, `item_value`, `sort_order`) VALUES
  (1, 'sailis',      '赛力斯',        'sailis',      1),
  (1, 'live_stream',  '直播间意向客户', 'live_stream',  2),
  (1, 'stock_order',  '存量工单',       'stock_order',  3),
  (1, 'api_import',   'API接入',        'api_import',   4);

-- 4.3 预置商品类型
INSERT INTO `sys_dict_item` (`dict_type_id`, `item_code`, `item_label`, `item_value`, `sort_order`) VALUES
  (7, 'charging_pile', '充电桩',  'charging_pile', 1),
  (7, 'warranty',      '延保',    'warranty',      2),
  (7, 'boutique',      '精品',    'boutique',      3);

-- 4.4 预置下单平台
INSERT INTO `sys_dict_item` (`dict_type_id`, `item_code`, `item_label`, `item_value`, `sort_order`) VALUES
  (8, 'douyin',  '抖音',  'douyin',  1),
  (8, 'tmall',   '天猫',  'tmall',   2),
  (8, 'jd',      '京东',  'jd',      3);

-- 4.5 预置超级管理员角色
INSERT INTO `sys_role` (`role_name`, `role_code`, `remark`) VALUES
  ('超级管理员', 'super_admin', '系统超级管理员，拥有全部权限'),
  ('销售',       'sales',       '销售人员');

-- 4.6 预置菜单权限
INSERT INTO `sys_permission` (`parent_id`, `perm_name`, `perm_code`, `perm_type`, `path`, `icon`, `sort_order`) VALUES
  (NULL, '首页',         'dashboard',         1, '/dashboard',         'House',         1),
  (NULL, '工作台',       'workbench',         1, '/workbench',         'Monitor',       2),
  (NULL, '线索池管理',   'lead',              1, '/lead',              'Collection',    3),
  (NULL, '客户管理',     'customer',          1, '/customer',          'User',          4),
  (NULL, '商品管理',     'product',           1, '/product',           'ShoppingBag',   5),
  (NULL, '订单管理',     'order',             1, '/order',             'Document',      6),
  (NULL, '组织管理',     'organization',      1, '/organization',      'OfficeBuilding',7),
  (NULL, '权限管理',     'permission',        1, '/permission',        'Lock',          8),
  (NULL, '日志管理',     'log',               1, '/log',               'Notebook',      9),
  (NULL, '消息中心',     'message',           1, '/message',           'Bell',          10);

-- 组织管理子菜单
INSERT INTO `sys_permission` (`parent_id`, `perm_name`, `perm_code`, `perm_type`, `path`, `sort_order`) VALUES
  (7, '组织架构', 'organization:tree',    1, '/organization/tree',    1),
  (7, '账号管理', 'organization:account', 1, '/organization/account', 2);

-- 权限管理子菜单
INSERT INTO `sys_permission` (`parent_id`, `perm_name`, `perm_code`, `perm_type`, `path`, `sort_order`) VALUES
  (8, '角色管理', 'permission:role',   1, '/permission/role',   1),
  (8, '权限配置', 'permission:config', 1, '/permission/config', 2);

-- 线索池操作权限
INSERT INTO `sys_permission` (`parent_id`, `perm_name`, `perm_code`, `perm_type`, `sort_order`) VALUES
  (3, '新增线索',   'lead:create',       2, 1),
  (3, '编辑线索',   'lead:edit',         2, 2),
  (3, '分配线索',   'lead:assign',       2, 3),
  (3, '领取线索',   'lead:claim',        2, 4),
  (3, '作废线索',   'lead:void',         2, 5),
  (3, '批量导入',   'lead:import',       2, 6),
  (3, '批量分配',   'lead:batch_assign', 2, 7);

-- 账号管理操作权限
INSERT INTO `sys_permission` (`parent_id`, `perm_name`, `perm_code`, `perm_type`, `sort_order`) VALUES
  (12, '新增账号',   'account:create',         2, 1),
  (12, '编辑账号',   'account:edit',           2, 2),
  (12, '重置密码',   'account:reset_password', 2, 3);


-- ============================================================
-- 4.7 预置组织架构数据
-- ============================================================
INSERT INTO `sys_organization` (`id`, `parent_id`, `org_name`, `org_code`, `org_level`, `org_path`, `sort_order`) VALUES
  (1, NULL, '集团', 'org_001', 1, '/1/', 1),
  (2, 1, '门店1', 'ST001', 2, '/1/2/', 1),
  (3, 1, '门店2', 'ST002', 2, '/1/3/', 2),
  (4, 1, '门店3', 'ST003', 2, '/1/4/', 3),
  (5, 2, '销售组1', 'SLS001', 3, '/1/2/5/', 1),
  (6, 2, '销售组2', 'SLS002', 3, '/1/2/6/', 2),
  (7, 2, '销售组3', 'SLS003', 3, '/1/2/7/', 3),
  (8, 3, '销售组1', 'SLS004', 3, '/1/3/8/', 1),
  (9, 3, '销售组2', 'SLS005', 3, '/1/3/9/', 2),
  (10, 3, '销售组3', 'SLS006', 3, '/1/3/10/', 3),
  (11, 4, '销售组1', 'SLS007', 3, '/1/4/11/', 1),
  (12, 4, '销售组2', 'SLS008', 3, '/1/4/12/', 2),
  (13, 4, '销售组3', 'SLS009', 3, '/1/4/13/', 3);

-- ============================================================
-- 完成
-- ============================================================
SELECT '✅ CRM 销售系统数据库初始化完成！' AS result;
