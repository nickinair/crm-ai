// 生成批量导入压测用的模拟数据表（xlsx，流式写入）
// 用法: node scripts/gen_mock_import.js <行数> <输出文件>
const path = require('path');
const { createRequire } = require('module');
const backendRequire = createRequire(path.join(__dirname, '../apps/backend/package.json'));
const ExcelJS = backendRequire('exceljs');

const COUNT = parseInt(process.argv[2] || '100000', 10);
const OUT = process.argv[3] || path.join(__dirname, '..', `模拟线索导入数据_${COUNT}行.xlsx`);

const HEADERS = [
  '渠道来源', '线索来源方式', '来源日期', '客户姓名', '客户电话',
  '车架号', '品牌', '车型', '款式', '车牌号', '发票日期', '里程数',
  '里程≥4万公里（1：是；0：否）', '里程≥9.5万公里（1：是；0：否）',
  '是否已购整车延保（1：是；0：否）', '是否已购电池延保（1：是；0：否）',
  '是否已购安心保（1：是；0：否）', '是否已购轮胎保障（1：是；0：否）',
  '意向商品名称', '意向商品编码', '意向赠品名称'
];

// 与生产字典一致（2026-07-20 同步版）
const CHANNELS = ['存量用户', '抖音直播间', '赛力斯', '小红书'];
const SOURCE_METHODS = ['用户主动联系', '坐席电话营销'];
const SURNAMES = '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜'.split('');
const GIVENS = '伟芳娜敏静丽强磊军洋勇艳杰娟涛明超秀兰霞平刚桂英华玉梅红志坚'.split('');
const BRANDS = ['比亚迪', '特斯拉', '吉利', '长安', '广汽埃安', '蔚来', '理想', '小鹏'];
const MODELS = ['秦PLUS', '汉EV', 'Model 3', 'Model Y', '星越L', '深蓝S7', 'AION S', 'ES6', 'L7', 'G6'];
const STYLES = ['DM-i 120KM旗舰型', 'DM-i 55KM超越型', '2025款 长续航版', '2024款 标准版', '四驱性能版', '入门版'];
const PLATE_PREFIX = ['渝A', '京B', '沪C', '粤A', '川A', '浙B', '苏A', '鄂A'];

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randDate = (startY, startM, endTs) => {
  const start = new Date(startY, startM, 1).getTime();
  const t = start + Math.random() * (endTs - start);
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

(async () => {
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: OUT, useStyles: false, useSharedStrings: false });
  const ws = wb.addWorksheet('线索数据');
  ws.addRow(HEADERS).commit();

  const endTs = new Date(2026, 6, 19).getTime();
  for (let i = 0; i < COUNT; i++) {
    const phone = '15' + String(500000000 + i); // 11位、全局唯一、不与既有 138 号段冲突
    const name = rand(SURNAMES) + rand(GIVENS) + (Math.random() < 0.5 ? rand(GIVENS) : '');
    const hasVehicle = Math.random() < 0.7;
    let row;
    if (hasVehicle) {
      const vin = 'LSV' + i.toString(36).toUpperCase().padStart(14, '0'); // 17位唯一
      const mileage = Math.floor(Math.random() * 120000) + 500;
      row = [
        rand(CHANNELS), rand(SOURCE_METHODS), randDate(2026, 0, endTs), name, phone,
        vin, rand(BRANDS), rand(MODELS), rand(STYLES),
        rand(PLATE_PREFIX) + Math.random().toString(36).slice(2, 7).toUpperCase(),
        randDate(2023, 0, endTs), mileage,
        mileage >= 40000 ? '1' : '0', mileage >= 95000 ? '1' : '0',
        Math.random() < 0.3 ? '1' : '0', Math.random() < 0.3 ? '1' : '0',
        Math.random() < 0.2 ? '1' : '0', Math.random() < 0.2 ? '1' : '0',
        '', '', ''
      ];
    } else {
      row = [
        rand(CHANNELS), rand(SOURCE_METHODS), randDate(2026, 0, endTs), name, phone,
        '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''
      ];
    }
    ws.addRow(row).commit();
    if (i > 0 && i % 50000 === 0) console.log(`已生成 ${i} 行...`);
  }

  await wb.commit();
  const { statSync } = require('fs');
  const size = statSync(OUT).size;
  console.log(`完成: ${OUT}`);
  console.log(`行数: ${COUNT}, 文件大小: ${(size / 1024 / 1024).toFixed(2)} MB`);
})().catch(e => { console.error(e); process.exit(1); });
