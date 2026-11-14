// Dependency-free regression suite. Optional BASELINE_WEBSITE captures the old
// script before editing; its recorded output is checked against literal answers.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
let assertions = 0;
const eq = (actual, expected, label) => { assert.equal(actual, expected, label); assertions++; };
function calculator(sourceRoot = root) {
  const html = fs.readFileSync(path.join(sourceRoot,'tools/commission-calculator/index.html'),'utf8');
  const ids = {}, inputs = [];
  for (const tag of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    const el = { value:tag[0].match(/\bvalue="([^"]*)"/)?.[1] || '', textContent:'', hidden:/\bhidden\b/.test(tag[0]),style:{},attributes:{},events:{},
      addEventListener(event, fn) { (this.events[event] ||= []).push(fn); },
      setAttribute(key,value) { this.attributes[key] = value; },
      fire(event) { for (const fn of this.events[event] || []) fn({target:this,preventDefault(){}}); } };
    ids[tag[1]] = el;
    if (tag[0].startsWith('<input')) inputs.push(el);
  }
  let clipboard = '', prints = 0;
  vm.runInNewContext(fs.readFileSync(path.join(sourceRoot,'tools/commission-calculator/calculator.js'),'utf8'), {
    Intl, navigator:{clipboard:{writeText(text){clipboard=text;}}},window:{print(){prints++;}},
    document:{querySelector:s=>s==='#commission-form'?ids['commission-form']:null,querySelectorAll:()=>inputs,getElementById:id=>ids[id]}
  });
  return { ids, text:id=>ids[id]?.textContent, click:id=>ids[id]?.fire('click'),
    put(values) { for (const [id,value] of Object.entries(values)) {ids[id].value=String(value);ids[id].fire(id==='agent-role'?'change':'input');} },
    clipboard:()=>clipboard,prints:()=>prints };
}
const cases = [
  {name:'defaults / both sides',inputs:{},total:13500,net:9155,seller:436500},
  {name:'listing role',inputs:{'agent-role':'listing'},total:13500,net:4430,seller:436500},
  {name:'buyer role',inputs:{'agent-role':'buyer'},total:13500,net:4430,seller:436500},
  {name:'listing 40 percent',inputs:{'agent-role':'listing','listing-share':40},total:13500,net:3485,seller:436500},
  {name:'buyer 60 percent',inputs:{'agent-role':'buyer','listing-share':40},total:13500,net:5375,seller:436500},
  {name:'both ignores listing allocation',inputs:{'listing-share':10},total:13500,net:9155,seller:436500},
  {name:'50 percent agent split',inputs:{'agent-split':50},total:13500,net:6455,seller:436500},
  {name:'100 percent agent split',inputs:{'agent-split':100},total:13500,net:13205,seller:436500},
  {name:'zero agent split',inputs:{'agent-split':0},total:13500,net:-295,seller:436500},
  {name:'referral 10 percent',inputs:{'referral-fee':10},total:13500,net:8210,seller:436500},
  {name:'franchise 6 percent',inputs:{'franchise-fee':6},total:13500,net:8588,seller:436500},
  {name:'independent fees, listing',inputs:{'agent-role':'listing','referral-fee':10,'franchise-fee':6},total:13500,net:3674,seller:436500},
  {name:'independent fees, buyer 60 percent',inputs:{'agent-role':'buyer','listing-share':40,'referral-fee':10,'franchise-fee':6},total:13500,net:4467.8,seller:436500},
  {name:'transaction fee',inputs:{'transaction-fee':1000},total:13500,net:8450,seller:436500},
  {name:'closing costs and payoff',inputs:{'other-closing-costs':1.5,'mortgage-payoff':200000},total:13500,net:9155,seller:229750},
  {name:'zero commission',inputs:{'commission-rate':0},total:0,net:-295,seller:450000},
  {name:'zero price',inputs:{'sale-price':0},total:0,net:-295,seller:0},
  {name:'simple published example',inputs:{'sale-price':400000,'commission-rate':5},total:20000,net:13705,seller:380000},
  {name:'quick formula illustration',inputs:{'commission-rate':5},total:22500,net:15455,seller:427500},
  {name:'upper amounts and rate',inputs:{'sale-price':1e12,'commission-rate':100},total:1e12,net:699999999705,seller:0},
  {name:'negative earnings retained for excessive percentage fees',inputs:{'referral-fee':100,'franchise-fee':100},total:13500,net:-9745,seller:436500},
  {name:'negative seller proceeds retained',inputs:{'mortgage-payoff':500000},total:13500,net:9155,seller:-63500}
];
const money = n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n);
const baseline = process.env.BASELINE_WEBSITE ? [] : require('./fixtures/commission-baseline.json');
for (const test of cases) {
  const c = calculator(process.env.BASELINE_WEBSITE || root);
  c.click('mode-agent'); c.put(test.inputs);
  eq(c.text('commission-total'),money(test.total),test.name+' total');
  eq(c.text('commission-net'),money(test.net),test.name+' agent');
  eq(c.text('seller-net'),money(test.seller),test.name+' seller');
  if (process.env.BASELINE_WEBSITE) {
    baseline.push({...test,outputs:{total:c.text('commission-total'),agent:c.text('commission-net'),seller:c.text('seller-net')}});
  } else {
    const old = baseline.find(b=>b.name===test.name);
    eq(c.text('commission-total'),old.outputs.total,test.name+' total parity');
    eq(c.text('commission-net'),old.outputs.agent,test.name+' agent parity');
    eq(c.text('seller-net'),old.outputs.seller,test.name+' seller parity');
    c.click('mode-quick'); eq(c.text('primary-result'),money(test.total),test.name+' quick');
    c.click('mode-seller'); eq(c.text('primary-result'),money(test.seller),test.name+' seller view');
  }
}
const validationCases = [
  {id:'sale-price',value:'',error:'Property sale price is empty.'},
  {id:'sale-price',value:-1,error:'Property sale price must be 0 or more.'},
  {id:'commission-rate',value:101,error:'Total commission rate must be 0–100%.'},
  {id:'listing-share',value:101,error:'Listing side share must be 0–100%.'},
  {id:'agent-split',value:'',error:'Your commission split is empty.'},
  {id:'referral-fee',value:101,error:'Referral fee must be 0–100%.'},
  {id:'franchise-fee',value:-1,error:'Franchise / royalty fee must be 0–100%.'},
  {id:'transaction-fee',value:-1,error:'Transaction fee must be 0 or more.'},
  {id:'other-closing-costs',value:101,error:'Other seller closing costs must be 0–100%.'},
  {id:'mortgage-payoff',value:-1,error:'Mortgage payoff must be 0 or more.'},
  {id:'transaction-fee',value:'',error:'Transaction fee is empty.',currentError:''},
  {id:'mortgage-payoff',value:'',error:'Mortgage payoff is empty.',currentError:''}
];
const validationBaseline=[];
for(const test of validationCases) {
  const c=calculator(process.env.BASELINE_WEBSITE || root);
  c.click(['other-closing-costs','mortgage-payoff'].includes(test.id)?'mode-seller':'mode-agent');
  c.put({'agent-role':'listing',[test.id]:test.value});
  if(process.env.BASELINE_WEBSITE) {
    eq(c.text('result-empty'),test.error,'baseline '+test.id);
    validationBaseline.push({...test,output:c.text('result-empty')});
  } else {
    const old=require('./fixtures/commission-validation-baseline.json').find(b=>b.id===test.id&&b.value===test.value);
    eq(c.text('validation-note'),test.currentError===undefined?old.output:test.currentError,'validation parity '+test.id);
  }
}
if (process.env.BASELINE_WEBSITE) {
  fs.mkdirSync(path.join(__dirname,'fixtures'),{recursive:true});
  fs.writeFileSync(path.join(__dirname,'fixtures/commission-baseline.json'),JSON.stringify(baseline,null,2)+'\n');
  fs.writeFileSync(path.join(__dirname,'fixtures/commission-validation-baseline.json'),JSON.stringify(validationBaseline,null,2)+'\n');
  console.log(`PASS: captured ${cases.length} original-engine scenarios and ${validationCases.length} validation cases; ${assertions} independent expected-value assertions.`);
  process.exit(0);
}
let c = calculator();
eq(c.text('primary-result'),'$13,500.00','quick default');
eq(c.ids['mode-quick'].attributes['aria-pressed'],'true');
eq(c.ids['agent-inputs'].hidden,true); eq(c.ids['seller-inputs'].hidden,true);
c.put({'referral-fee':101,'mortgage-payoff':-100}); eq(c.text('primary-result'),'$13,500.00','hidden invalid fields do not affect quick');
c.click('mode-agent'); eq(c.text('primary-result'),'—'); eq(c.ids['referral-fee'].attributes['aria-invalid'],'true');
c.put({'referral-fee':10,'franchise-fee':6,'transaction-fee':500});
eq(c.text('primary-result'),'$7,438.00'); eq(c.text('fee-indicator'),'Custom fees applied');
c.click('mode-seller'); eq(c.text('primary-result'),'—','seller validates own negative payoff');
c.put({'mortgage-payoff':'','other-closing-costs':''}); eq(c.text('primary-result'),'$436,500.00','blank optional seller costs zero');
c.click('mode-agent'); eq(c.text('primary-result'),'$7,438.00','agent inputs preserved');
c.put({'agent-role':'both','listing-share':101}); eq(c.text('primary-result'),'$7,438.00','both ignores invalid allocation');
c.put({'agent-role':'listing'}); eq(c.text('primary-result'),'—','listing allocation now validates');
c.put({'listing-share':40}); eq(c.text('primary-result'),'$2,675.20');
for (const [id,value,message] of [
  ['sale-price','', 'Property sale price is empty.'],['sale-price',-1,'Property sale price must be 0 or more.'],
  ['sale-price',1000000000001,'Property sale price must be at most 1,000,000,000,000.'],
  ['commission-rate',101,'Total commission rate must be 0–100%.'],['commission-rate',-1,'Total commission rate must be 0–100%.'],
  ['commission-rate','', 'Total commission rate is empty.'],['commission-rate','NaN','Total commission rate must be 0–100%.']
]) {
  c = calculator(); c.put({[id]:value}); eq(c.text('validation-note'),message); eq(c.text('primary-result'),'—');
  eq(c.ids['copy-results'].disabled,true); eq(c.ids['print-results'].disabled,true);
}
c=calculator(); c.click('mode-agent'); c.put({'referral-fee':'','franchise-fee':'','transaction-fee':''});
eq(c.text('primary-result'),'$9,450.00','empty optional fees zero');
c=calculator(); c.click('copy-results'); eq(c.clipboard().includes('Quick Commission'),true); eq(c.clipboard().includes('Transaction fee:'),false);
c.click('mode-agent'); c.click('copy-results'); eq(c.clipboard().includes('Transaction fee: $295.00'),true); eq(c.clipboard().includes('Estimated seller proceeds:'),false);
c.click('mode-seller'); c.click('copy-results'); eq(c.clipboard().includes('Estimated seller proceeds: $436,500.00'),true); eq(c.clipboard().includes('Agent split:'),false);
c.click('print-results'); eq(c.prints(),1); eq(c.text('print-report'),c.clipboard());
c.put({'sale-price':500000,'referral-fee':20,'franchise-fee':10,'transaction-fee':1000,'mortgage-payoff':10000});
c.click('reset-calculator'); eq(c.text('primary-result'),'$13,500.00');
for(const [id,value] of Object.entries({'sale-price':'450000','commission-rate':'3','referral-fee':'0','franchise-fee':'0','transaction-fee':'295','mortgage-payoff':'0','other-closing-costs':'0'})) eq(c.ids[id].value,value,'reset '+id);
eq(c.ids['mode-quick'].attributes['aria-pressed'],'true'); eq(c.ids['advanced-fees'].open,false);
console.log(`PASS: ${assertions} commission assertions; ${cases.length} scenarios match captured baseline and independent numerical answers; mode state, validation, reset, copy and print covered.`);
