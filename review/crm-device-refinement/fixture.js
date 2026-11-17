document.addEventListener('DOMContentLoaded',async()=>{
 try{
 if(App.i18n)await App.i18n.setLocale(App.preferences.get().language);
 if(new URLSearchParams(location.search).has('auth')){await App.cloud.checkSession();return;}
 const state=App.store._emptyState();state.settings.ui={theme:'light'};
 const user={id:'00000000-0000-4000-a000-000000000001',email:'a.very.long.account.address@example.test',user_metadata:{full_name:'Alexandra Real Estate Professional Long Name'}};
 App.cloud.getUser=()=>user;
 const workspace={ready:()=>true,id:()=> '00000000-0000-4000-a000-000000000002',permissions:()=>({settings:'edit'}),can:()=>true,canView:()=>true,canCreate:()=>true,canEditSettings:()=>true,canViewSettings:()=>true,isOwner:()=>true,role:()=> 'owner',teamMemberId:()=>null,memberId:()=>null,onChange:()=>()=>{},scope:()=> 'all',ownsRow:()=>true,canEditRow:()=>true,canDeleteRow:()=>true,commissionFiguresHidden:()=>false};App.workspace=workspace;
 state.contacts.push({id:'c1',name:'Contacts',email:'alex@example.test',role:'Buyer',stage:'New Lead',temperature:'Warm',phone:'555-0100'});
 state.deals.push({id:'d1',name:'Riverside purchase',stageId:state.settings.pipelineStages[0].id,stage:state.settings.pipelineStages[0].name,salePrice:485000,contactId:'c1',commissionType:'Percent',commissionRate:3,probability:50,status:'Active'});
 const store={ensureLoaded:async()=>{},getState:()=>state,_emptyState:App.store._emptyState,_defaultCustomization:App.store._defaultCustomization,settings:{update:async p=>Object.assign(state.settings,p)},getSyncState:()=>({status:'saved'}),onSyncStateChange:()=>()=>{}};
 store.search=async(entity,query)=>({rows:state[entity].filter(row=>Object.values(row).some(value=>String(value).toLowerCase().includes(query.toLowerCase()))),hasMore:false});
 for(const [name,rows]of Object.entries(state))if(Array.isArray(rows))store[name]={list:async()=>rows.slice(),get:async id=>rows.find(r=>r.id===id),create:async model=>{const r={id:name+'-'+Date.now(),...model};rows.push(r);return r;},update:async(id,patch)=>Object.assign(rows.find(r=>r.id===id),patch),delete:async id=>{const i=rows.findIndex(r=>r.id===id);if(i>=0)rows.splice(i,1);}};
 store.customFields={definitionsFor:()=>[],activeDefinitionsFor:()=>[],valuesFor:()=>[],getValues:async()=>[],definitions:()=>[],ENTITIES:['contact','deal','property','task'],TYPES:['text','number','date'],list:async()=>[]};
 store.notifications={list:async()=>({rows:[],total:0}),unreadCount:async()=>0,markRead:async()=>{},markAllRead:async()=>{}};
 store.push={devices:async()=>[],preferences:async()=>({push_enabled:false,push_types:[],all_types:['lead_replied','contact_untouched','overdue_followups'],quiet_start:null,quiet_end:null}),savePreferences:async()=>{}};
 App.store=store;window.__qaState=state;App.app.renderShell();App.app.refreshNav();window.addEventListener('hashchange',()=>App.app.route());await App.app.route();
 }catch(err){console.error(err);document.body.insertAdjacentHTML('beforeend','<pre id="qaError"></pre>');document.getElementById('qaError').textContent=err.stack;}
});
