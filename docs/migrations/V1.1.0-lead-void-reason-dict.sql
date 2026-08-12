-- 线索作废原因字典（PRD 4.3.3 / 4.5）：幂等，可在 prod/test 重复执行
INSERT INTO sys_dict_type (dict_type_code, dict_type_name, status, remark)
SELECT 'lead_void_reason', '线索作废原因', 1, '作废线索弹框下拉选项（PRD 4.3.3）'
WHERE NOT EXISTS (SELECT 1 FROM sys_dict_type WHERE dict_type_code = 'lead_void_reason');

SET @tid = (SELECT id FROM sys_dict_type WHERE dict_type_code = 'lead_void_reason');

INSERT INTO sys_dict_item (dict_type_id, item_code, item_label, item_value, sort_order, status)
SELECT @tid, v.code, v.label, v.label, v.sort, 1
FROM (
  SELECT 'duplicate'    AS code, '重复线索'   AS label, 1 AS sort UNION ALL
  SELECT 'invalid_phone',        '号码无效',          2 UNION ALL
  SELECT 'no_intention',         '客户无意向',        3 UNION ALL
  SELECT 'unreachable',          '多次联系不上',      4 UNION ALL
  SELECT 'other',                '其他',              9
) v
WHERE NOT EXISTS (
  SELECT 1 FROM sys_dict_item i WHERE i.dict_type_id = @tid AND i.item_value = v.label
);
