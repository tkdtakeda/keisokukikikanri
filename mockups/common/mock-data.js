/* ── モック用の固定データ ──
   レイアウト評価のための見本。本実装の IndexedDB とは無関係。 */
(function () {
  'use strict';

  const TODAY = '2026-11-06';

  /** 設置先：部 > 課 > ライン（どの階層にも置ける） */
  const locations = [
    { id: 'L1', name: '製造部', parent: null },
    { id: 'L2', name: '加工課', parent: 'L1' },
    { id: 'L3', name: '第1加工ライン', parent: 'L2' },
    { id: 'L4', name: '第2加工ライン', parent: 'L2' },
    { id: 'L5', name: '組立課', parent: 'L1' },
    { id: 'L6', name: '組立ライン', parent: 'L5' },
    { id: 'L7', name: '品質保証部', parent: null },
    { id: 'L8', name: '品証課', parent: 'L7' },
    { id: 'L9', name: '標準室', parent: 'L8' },
    { id: 'L10', name: '試験室', parent: 'L8' }
  ];

  /** 分類：大分類（kind）と分類。校正周期は月 */
  const categories = [
    { id: 'C1', name: 'マイクロメータ', kind: 'measure', interval: 12, key: '設置先＋管理番号' },
    { id: 'C2', name: 'ノギス', kind: 'measure', interval: 12, key: '設置先＋管理番号' },
    { id: 'C3', name: 'すきまゲージ', kind: 'measure', interval: 6, key: '設置先＋管理番号' },
    { id: 'C4', name: 'ダイヤルゲージ', kind: 'measure', interval: 12, key: '設置先＋管理番号' },
    { id: 'C5', name: 'ブロックゲージセット', kind: 'standard', interval: 24, key: '製造番号' },
    { id: 'C6', name: 'ブロックゲージ', kind: 'standard', interval: 24, key: '製造番号' },
    { id: 'C7', name: '校正用マイクロメータ', kind: 'standard', interval: 12, key: '製造番号' },
    { id: 'C8', name: '校正用すきまゲージ', kind: 'standard', interval: 12, key: '製造番号' },
    { id: 'C9', name: '引張試験機', kind: 'test', interval: 12, key: '製造番号' },
    { id: 'C10', name: '力計', kind: 'test', interval: 12, key: '製造番号' },
    { id: 'C11', name: '伸び計', kind: 'test', interval: 12, key: '製造番号' },
    { id: 'C12', name: 'ロードセル', kind: 'test', interval: 12, key: '製造番号' }
  ];

  const KIND = {
    measure: { label: '測定機器', icon: 'fa-ruler-combined' },
    standard: { label: '標準器', icon: 'fa-scale-balanced' },
    test: { label: '試験機器', icon: 'fa-gauge-high' }
  };

  /** 個体。lastCal は前回校正日、parent は包含の親 */
  const assets = [
    { id: 'A01', cat: 'C1', no: 'M-001', serial: '', model: 'MDC-25MX 0-25mm', maker: 'ミツトヨ', loc: 'L3', parent: null, lastCal: '2025-11-20', state: '使用中' },
    { id: 'A02', cat: 'C1', no: 'M-002', serial: '', model: 'MDC-50MX 25-50mm', maker: 'ミツトヨ', loc: 'L3', parent: null, lastCal: '2025-10-28', state: '使用中' },
    { id: 'A03', cat: 'C2', no: 'N-001', serial: '', model: 'CD-15AX 150mm', maker: 'ミツトヨ', loc: 'L3', parent: null, lastCal: '2026-04-10', state: '使用中' },
    { id: 'A04', cat: 'C3', no: 'S-001', serial: '', model: '150A13 13枚組', maker: '永井ゲージ', loc: 'L3', parent: null, lastCal: '2026-05-12', state: '使用中' },
    { id: 'A05', cat: 'C1', no: 'M-001', serial: '', model: 'MDC-25MX 0-25mm', maker: 'ミツトヨ', loc: 'L4', parent: null, lastCal: '2026-02-03', state: '使用中' },
    { id: 'A06', cat: 'C2', no: 'N-001', serial: '', model: 'CD-20AX 200mm', maker: 'ミツトヨ', loc: 'L4', parent: null, lastCal: '2025-12-01', state: '使用中' },
    { id: 'A07', cat: 'C4', no: 'D-001', serial: 'DG8812', model: '2046S 0.01mm', maker: 'ミツトヨ', loc: 'L4', parent: null, lastCal: '2026-01-15', state: '使用中' },
    { id: 'A08', cat: 'C3', no: 'S-001', serial: '', model: '100A19 19枚組', maker: '永井ゲージ', loc: 'L4', parent: null, lastCal: '2026-04-30', state: '使用中' },
    { id: 'A09', cat: 'C1', no: 'M-003', serial: '', model: 'MDC-25MX 0-25mm', maker: 'ミツトヨ', loc: 'L6', parent: null, lastCal: '2026-06-18', state: '使用中' },
    { id: 'A10', cat: 'C2', no: 'N-002', serial: '', model: 'CD-15AX 150mm', maker: 'ミツトヨ', loc: 'L6', parent: null, lastCal: '2026-06-18', state: '使用中' },
    { id: 'A11', cat: 'C2', no: 'N-003', serial: '', model: 'CD-15AX 150mm', maker: 'ミツトヨ', loc: 'L2', parent: null, lastCal: '2026-03-09', state: '保管' },
    { id: 'A12', cat: 'C1', no: 'M-002', serial: '', model: 'MDC-25MX 0-25mm', maker: 'ミツトヨ', loc: 'L4', parent: null, lastCal: '2023-05-10', state: '廃棄' },
    /* 標準器：セットと中のゲージ（兄弟） */
    { id: 'A20', cat: 'C5', no: 'BG-01', serial: 'BS-210455', model: '516-940 0級 47個組', maker: 'ミツトヨ', loc: 'L9', parent: null, lastCal: '2025-01-20', state: '使用中' },
    { id: 'A21', cat: 'C6', no: '', serial: 'BS-210455-01', model: '1.000mm', maker: 'ミツトヨ', loc: 'L9', parent: 'A20', lastCal: '2025-01-20', state: '使用中' },
    { id: 'A22', cat: 'C6', no: '', serial: 'BS-210455-02', model: '2.000mm', maker: 'ミツトヨ', loc: 'L9', parent: 'A20', lastCal: '2025-01-20', state: '使用中' },
    { id: 'A23', cat: 'C6', no: '', serial: 'BS-210455-05', model: '5.000mm', maker: 'ミツトヨ', loc: 'L9', parent: 'A20', lastCal: '2025-01-20', state: '使用中' },
    { id: 'A24', cat: 'C6', no: '', serial: 'BS-210455-10', model: '10.000mm', maker: 'ミツトヨ', loc: 'L9', parent: 'A20', lastCal: '2024-11-28', state: '使用中' },
    { id: 'A25', cat: 'C5', no: 'BG-02', serial: 'BS-198812', model: '516-941 1級 32個組', maker: 'ミツトヨ', loc: 'L9', parent: null, lastCal: '2025-06-02', state: '使用中' },
    { id: 'A26', cat: 'C6', no: '', serial: 'BS-198812-01', model: '1.000mm', maker: 'ミツトヨ', loc: 'L9', parent: 'A25', lastCal: '2025-06-02', state: '使用中' },
    { id: 'A27', cat: 'C6', no: '', serial: 'BS-198812-03', model: '3.000mm', maker: 'ミツトヨ', loc: 'L9', parent: 'A25', lastCal: '2025-06-02', state: '使用中' },
    { id: 'A28', cat: 'C7', no: 'CM-01', serial: 'CM55102', model: '基準棒付 0-25mm', maker: 'ミツトヨ', loc: 'L9', parent: null, lastCal: '2025-12-10', state: '使用中' },
    { id: 'A29', cat: 'C8', no: 'CS-01', serial: 'TG-7781', model: '0.01-1.00mm', maker: '永井ゲージ', loc: 'L9', parent: null, lastCal: '2026-08-21', state: '使用中' },
    /* 試験機器：試験機 > 力計 > ロードセル（親・子・孫）、伸び計（兄弟） */
    { id: 'A40', cat: 'C9', no: 'T-01', serial: 'AG-X-5531', model: 'AG-X plus 100kN', maker: '島津製作所', loc: 'L10', parent: null, lastCal: '2026-01-22', state: '使用中' },
    { id: 'A41', cat: 'C10', no: '', serial: 'FC-30018', model: '荷重計測系 100kN', maker: '島津製作所', loc: 'L10', parent: 'A40', lastCal: '2026-01-22', state: '使用中' },
    { id: 'A42', cat: 'C12', no: '', serial: 'LC-88120', model: 'SFL-100kN AG', maker: '島津製作所', loc: 'L10', parent: 'A41', lastCal: '2026-01-22', state: '使用中' },
    { id: 'A43', cat: 'C11', no: '', serial: 'EX-20514', model: 'SSG50-10H', maker: '島津製作所', loc: 'L10', parent: 'A40', lastCal: '2025-11-02', state: '使用中' }
  ];

  /** 記録（校正・移動など）。詳細表示の見本 */
  const events = [
    { asset: 'A01', date: '2025-11-20', type: '校正', result: '合格', by: '田中', std: 'BG-01' },
    { asset: 'A01', date: '2024-11-18', type: '校正', result: '合格', by: '田中', std: 'BG-01' },
    { asset: 'A01', date: '2024-06-03', type: '移動', result: '第2加工ライン → 第1加工ライン', by: '佐藤', std: '' },
    { asset: 'A01', date: '2023-11-22', type: '校正', result: '調整後合格', by: '田中', std: 'BG-02' },
    { asset: 'A20', date: '2025-01-20', type: '外部校正', result: '合格（成績書あり）', by: 'JCSS事業者', std: '' },
    { asset: 'A40', date: '2026-01-22', type: '校正', result: '合格', by: '島津サービス', std: '' },
    { asset: 'A43', date: '2025-11-02', type: '校正', result: '合格', by: '島津サービス', std: '' }
  ];

  window.MockData = { TODAY, locations, categories, assets, events, KIND };
})();
