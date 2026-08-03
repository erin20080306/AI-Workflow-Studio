'use strict';
/* global module */

const LATIN_HEADER_TERMS = new Set([
  'amount',
  'cost',
  'customer',
  'date',
  'id',
  'item',
  'name',
  'order',
  'price',
  'product',
  'qty',
  'quantity',
  'status',
  'total',
]);

const CJK_HEADER_TERMS = [
  '品名',
  '單價',
  '单价',
  '客戶',
  '客户',
  '成本',
  '日期',
  '料號',
  '料号',
  '狀態',
  '状态',
  '編號',
  '编号',
  '數量',
  '数量',
  '訂單',
  '订单',
  '金額',
  '金额',
];

function looksLikeSpreadsheetHeader(value) {
  const normalized = value.normalize('NFKC').trim().toLocaleLowerCase();
  if (CJK_HEADER_TERMS.some((term) => normalized.includes(term))) return true;
  return normalized.split(/[^a-z0-9]+/u).some((token) => LATIN_HEADER_TERMS.has(token));
}

module.exports = { looksLikeSpreadsheetHeader };
