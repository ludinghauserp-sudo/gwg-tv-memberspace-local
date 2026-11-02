export type ClipPerson={id:string;editing:boolean};
export type Clip={due_date?:string;id:string;title:string;notes:string;participants:ClipPerson[];progress:number;revision:number;archived:number;updated_at:number};
export const canUpdateClip=(clip:Pick<Clip,'participants'>,userId:string,admin:boolean)=>admin||clip.participants.some(p=>p.id===userId);
export function clipStage(progress:number){return progress>=100?{label:'Finished',color:'#157448',className:'finished'}:progress>=50?{label:'Filmed',color:'#9b5b00',className:'filmed'}:{label:progress===0?'Not started':'In production',color:'#166d9a',className:'production'}};
