const receivableKeys=new Set(['receivable','aged-receivable']);
export function mergeDashboardSection(previous,body,section) {
 if(section==='core')return {...body,
  cards:body.cards.map(card=>receivableKeys.has(card.key)?previous.cards?.find(item=>item.key===card.key)||{...card,amount:null,count:null}:card),
  tasks:body.tasks.map(task=>receivableKeys.has(task.key)?previous.tasks?.find(item=>item.key===task.key)||{...task,amount:null,count:null}:task),
  aging:body.aging.map(item=>({...item,receivable:previous.aging?.find(row=>row.band===item.band)?.receivable??null})),
  parties:{...body.parties,receivable:previous.parties?.receivable||[]},
  tax:previous.tax||[],
  sectionPending:{receivable:true,tax:true},sectionErrors:{},loading:false};
 if(section==='tax')return {...previous,tax:body.tax,sectionPending:{...previous.sectionPending,tax:false}};
 return {...previous,
  cards:previous.cards.map(card=>receivableKeys.has(card.key)?body.cards.find(item=>item.key===card.key):card),
  tasks:previous.tasks.map(task=>receivableKeys.has(task.key)?body.tasks.find(item=>item.key===task.key):task),
  aging:previous.aging.map(item=>({...item,receivable:body.aging.find(row=>row.band===item.band)?.receivable||0})),
  parties:{...previous.parties,receivable:body.parties.receivable},
  sectionPending:{...previous.sectionPending,receivable:false}};
}
