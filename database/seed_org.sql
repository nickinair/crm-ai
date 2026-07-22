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
  (13, 4, '销售组3', 'SLS009', 3, '/1/4/13/', 3)
ON DUPLICATE KEY UPDATE `org_name`=VALUES(`org_name`), `parent_id`=VALUES(`parent_id`), `org_level`=VALUES(`org_level`), `org_path`=VALUES(`org_path`);
