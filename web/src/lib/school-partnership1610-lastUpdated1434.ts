export const partnershipStages = {new:'New enquiry',discussion:'Partnership discussion',commission:'Commission agreement',mou:'MOU pending',verification:'Verification pending',confirmed:'Collaboration confirmed',closed:'Closed'};
export type PartnershipStage=keyof typeof partnershipStages;
export const partnershipOutcomes:Record<string,{label:string;stage?:PartnershipStage;close?:boolean;hold?:boolean}>={
 no_answer:{label:'Didn’t answer'},unreachable:{label:'Busy / unreachable'},callback:{label:'Callback requested'},wrong_contact:{label:'Find correct decision-maker'},
 interested:{label:'Interested — discuss partnership',stage:'discussion'},approval:{label:'School management approval pending',hold:true},needs_time:{label:'School needs more time',hold:true},
 negotiate:{label:'Discuss commission terms',stage:'commission'},changes:{label:'Commission changes requested',stage:'commission'},terms_accepted:{label:'Commission terms accepted',stage:'mou'},
 prepare:{label:'Prepare MOU',stage:'mou'},sent:{label:'MOU sent to school',stage:'mou'},mou_changes:{label:'School requested MOU changes',stage:'commission'},signature:{label:'School signature / stamp pending',stage:'mou'},
 not_interested:{label:'Not interested',stage:'closed',close:true},invalid:{label:'Wrong enquiry / invalid contact',stage:'closed',close:true},
};
const stageActions:Record<PartnershipStage,string[]>={new:['interested'],discussion:['interested','negotiate'],commission:['negotiate','changes','terms_accepted'],mou:['prepare','sent','mou_changes','signature'],verification:['mou_changes'],confirmed:[],closed:[]};
export function allowedPartnershipOutcomes(stage:PartnershipStage){if(!Object.hasOwn(stageActions,stage)||['confirmed','closed'].includes(stage))return[];return ['no_answer','unreachable','callback','wrong_contact','approval','needs_time',...stageActions[stage],'not_interested','invalid'];}
