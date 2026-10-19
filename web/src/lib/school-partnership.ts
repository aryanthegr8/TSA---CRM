export const partnershipStages = {new:'New enquiry',discussion:'Partnership discussion',commission:'Commission agreement',mou:'MOU pending',verification:'Verification pending',confirmed:'Collaboration confirmed',closed:'Closed'};
export type PartnershipStage=keyof typeof partnershipStages;
export const partnershipOutcomes:Record<string,{label:string;stage?:PartnershipStage;close?:boolean;hold?:boolean}>={
 no_answer:{label:'Didn’t answer'},unreachable:{label:'Busy / unreachable'},callback:{label:'Callback requested'},wrong_contact:{label:'Find correct decision-maker'},
 explained:{label:'Partnership model explained'},interested:{label:'Interested — discuss partnership',stage:'discussion'},approval:{label:'School management approval pending',hold:true},needs_time:{label:'School needs more time',hold:true},
 negotiate:{label:'Discuss commission terms',stage:'commission'},changes:{label:'Commission changes requested',stage:'commission'},terms_accepted:{label:'Commission terms accepted',stage:'mou'},
 prepare:{label:'Prepare MOU',stage:'mou'},sent:{label:'MOU sent to school',stage:'mou'},mou_changes:{label:'School requested MOU changes',stage:'commission'},signature:{label:'School signature / stamp pending',stage:'mou'},
 not_interested:{label:'Not interested',stage:'closed',close:true},invalid:{label:'Wrong enquiry / invalid contact',stage:'closed',close:true},
};
const stageActions:Record<PartnershipStage,string[]>={new:['interested'],discussion:['explained','negotiate'],commission:['negotiate','changes','terms_accepted'],mou:['prepare','sent','mou_changes','signature'],verification:['mou_changes'],confirmed:[],closed:[]};
export function allowedPartnershipOutcomes(stage:PartnershipStage){if(!Object.hasOwn(stageActions,stage)||['confirmed','closed'].includes(stage))return[];return ['no_answer','unreachable','callback',...(['new','discussion'].includes(stage)?['wrong_contact']:[]),...(['discussion','commission','mou'].includes(stage)?['approval']:[]),'needs_time',...stageActions[stage],'not_interested','invalid'];}

export const partnershipStageOrder:PartnershipStage[]=['new','discussion','commission','mou','verification','confirmed'];
export const partnershipGuidance:Record<PartnershipStage,{description:string;next:string}>={
 new:{description:'Contact the school’s decision-maker and confirm interest.',next:'Record Interested — discuss partnership'},
 discussion:{description:'Explain TSA’s admission-referral model and resolve the school’s questions.',next:'Begin commission discussion'},
 commission:{description:'Record proposed and agreed charges. Saving the figures does not accept the agreement.',next:'Save agreed terms, then record Commission terms accepted'},
 mou:{description:'Commission terms are accepted. Obtain the school-signed MOU.',next:'Upload the signed school MOU in Commission & MOU'},
 verification:{description:'Signed MOU received. Collaboration is not yet confirmed.',next:'Admin or manager reviews the document and confirms collaboration'},
 confirmed:{description:'Signed MOU verified and partner school linked. Acquisition is complete.',next:'No further acquisition callback required'},
 closed:{description:'School acquisition closed. Previous records remain available.',next:'No further acquisition callback required'},
};
export function partnershipNextAction(outcome:string){
 const actions:Record<string,string>={explained:'Confirm school interest and begin commission discussion',no_answer:'Retry school contact',unreachable:'Retry school contact',callback:'Call school at requested time',wrong_contact:'Find and contact the correct decision-maker',interested:'Discuss the partnership and commission model',approval:'Obtain school management approval',needs_time:'Reconnect with school after requested time',negotiate:'Confirm school-specific commission terms',changes:'Resolve requested commission changes',terms_accepted:'Prepare and send MOU to school',prepare:'Send MOU to school for signature',sent:'Follow up for school signature and stamp',mou_changes:'Resolve MOU / commercial changes before resending',signature:'Collect signed MOU from school'};
 return actions[outcome]??'Follow up with school';
}
