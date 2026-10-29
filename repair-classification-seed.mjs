import {CLASSIFICATION_MAPPINGS,REPAIR_TYPES,categoryOfMapping,repairTypeKey} from './repair-classification.mjs';

// Called inside the startup transaction. Inserts only; never touches requests or reports.
export async function seedRepairClassificationMasters(client){
    // Add the new hierarchy once; preserve all existing master rows and requests.
    const hierarchySeed=await client.query("SELECT value FROM app_metadata WHERE key='repair_category_hierarchy_v1' FOR UPDATE");
    if(!hierarchySeed.rows.length){
      const mappingRows=await client.query("SELECT record_data FROM master_records WHERE master_name='Breakdown Sub-Category'");
      const existingMappings=mappingRows.rows.map(row=>row.record_data);
      for(const mapping of CLASSIFICATION_MAPPINGS){
        if(existingMappings.some(row=>categoryOfMapping(row)===categoryOfMapping(mapping)&&String(row.subCategory||'').trim().toLowerCase()===mapping.subCategory.toLowerCase()))continue;
        await client.query("INSERT INTO master_records(master_name,record_data) VALUES('Breakdown Sub-Category',$1::jsonb)",[JSON.stringify({repairType:mapping.breakdownCategory,subCategory:mapping.subCategory})]);
      }
      const categories=[...new Set([...CLASSIFICATION_MAPPINGS.map(categoryOfMapping),...existingMappings.map(categoryOfMapping)])].filter(Boolean);
      for(const breakdownCategory of categories)await client.query(`INSERT INTO master_records(master_name,record_data)
        SELECT 'Breakdown Category',$1::jsonb WHERE NOT EXISTS(SELECT 1 FROM master_records WHERE master_name='Breakdown Category' AND record_data->>'breakdownCategory'=$2)`,[JSON.stringify({breakdownCategory}),breakdownCategory]);
      const types=await client.query("SELECT record_data FROM master_records WHERE master_name='Repair type master'");
      for(const repairType of REPAIR_TYPES)if(!types.rows.some(row=>repairTypeKey(row.record_data.repairType)===repairTypeKey(repairType)))
        await client.query("INSERT INTO master_records(master_name,record_data) VALUES('Repair type master',$1::jsonb)",[JSON.stringify({repairType})]);
      await client.query("INSERT INTO app_metadata(key,value,updated_at) VALUES('repair_category_hierarchy_v1','true',NOW()) ON CONFLICT(key) DO NOTHING");
    }
}
