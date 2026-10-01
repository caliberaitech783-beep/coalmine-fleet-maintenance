// Inventory identities only: the visible reference report does not show balance columns.
export const STOCK_STATEMENT_SQL = `
SELECT location.locationname AS location, itemgroup.itemname AS item_group,
       item.itemcode AS item_code, item.itemname AS item_name,
       spec.itemspecificationname AS specification, make.itemmakename AS description,
       deals.dealsinname AS deals_in, category.itemcategoryname AS item_category
FROM (
  SELECT DISTINCT locationcode, itemcode, itemspecificationcode
  FROM cmpl.stock
) balance
JOIN cmpl.location location ON location.locationcode = balance.locationcode
JOIN cmpl.item item ON item.itemcode = balance.itemcode
LEFT JOIN cmpl.item itemgroup ON itemgroup.itemcode = item.parentcode AND itemgroup.itemtype = 'GROUP'
LEFT JOIN cmpl.itemspecification spec ON spec.tno = item.tno AND spec.itemspecificationcode = balance.itemspecificationcode
LEFT JOIN cmpl.itemmake make ON make.itemmakecode = spec.itemmakecode
LEFT JOIN cmpl.dealsin deals ON deals.dealsincode = NVL(spec.dealsincode,item.dealsincode)
LEFT JOIN cmpl.itemcategory category ON category.itemcategorycode = item.itemcategorycode
ORDER BY location.locationname, item.itemname, item.itemcode, balance.itemspecificationcode`;

export function stockStatementRow(row, index) {
  return {serialNo:index+1, location:row.LOCATION || '', itemGroup:row.ITEM_GROUP || '',
    itemCode:String(row.ITEM_CODE ?? ''), itemName:row.ITEM_NAME || '',
    specification:row.SPECIFICATION || '', description:row.DESCRIPTION || '',
    dealsIn:row.DEALS_IN || '', itemCategory:row.ITEM_CATEGORY || ''};
}
