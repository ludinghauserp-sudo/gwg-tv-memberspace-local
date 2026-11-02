import type {PlanNode,PlanDocument} from './planner-core';
export const isCamera = (data:PlanNode['data']) => /camera|gopro|osmo|webcam|pxw/i.test(data.name);
export const videoPort = (type:string) => ['HDMI','SDI','DisplayPort','DVI','VGA'].includes(type);
export function visiblePorts(node:PlanNode, side:'inputs'|'outputs', edges:PlanDocument['edges']) {
  return node.data[side].filter(port => !isCamera(node.data) ||
    (side==='outputs' && videoPort(port.type)) ||
    node.data.enabledPorts?.includes(side+':'+port.id) ||
    edges.some(e=>side==='inputs'?e.target===node.id&&e.targetHandle===port.id:e.source===node.id&&e.sourceHandle===port.id));
}
// Keep authored colors; brighten only their dark-canvas text representation.
export function canvasTextColor(color:string,dark:boolean){
 if(!dark)return color;
 const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
 const luminance=(values:number[])=>values.map(v=>{const n=v/255;return n<=0.04045?n/12.92:((n+0.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0);
 const background=luminance([29,48,62]);
 for(let mix=0;mix<=1;mix+=0.05){const result=rgb.map(v=>Math.round(v+(255-v)*mix));if((luminance(result)+0.05)/(background+0.05)>=4.5)return '#'+result.map(v=>v.toString(16).padStart(2,'0')).join('')}
 return '#ffffff';
}
