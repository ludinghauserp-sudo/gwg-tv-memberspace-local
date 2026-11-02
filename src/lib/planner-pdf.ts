import {jsPDF} from 'jspdf';
import {packRows,type PlanDocument} from './planner-core';
const clean=(v:unknown)=>String(v??'').replace(/[–—]/g,'-').replace(/→/g,' > ').replace(/·/g,' / ');
export function createPlanPdf(doc:PlanDocument,title:string,diagram?:{png:string;width:number;height:number}) {
  const pdf=new jsPDF({orientation:diagram?'landscape':'portrait',unit:'mm',format:diagram?'a3':'a4'});
  pdf.setProperties({title:title+' | GWG TV production plan',author:'GWG TV',subject:'Setup diagram, parts and signal connections'});
  let section='',y=0;
  function heading(name:string){
    section=name; const w=pdf.internal.pageSize.getWidth();
    pdf.setFillColor(9,36,56);pdf.rect(0,0,w,31,'F');pdf.setTextColor(255);pdf.setFont('helvetica','bold');pdf.setFontSize(11);pdf.text('GWG TV  /  PRODUCTION PLAN',14,10);
    pdf.setFontSize(17);pdf.text(pdf.splitTextToSize(clean(title),w-28).slice(0,1),14,20);
    pdf.setFont('helvetica','normal');pdf.setFontSize(8);pdf.text(clean([doc.meta.location,doc.meta.eventDate&&'Shoot: '+doc.meta.eventDate,doc.meta.rigDate&&'Rig: '+doc.meta.rigDate,doc.meta.jobId&&'Job: '+doc.meta.jobId].filter(Boolean).join('  /  ')),14,27,{maxWidth:w-28});
    pdf.setTextColor(9,36,56);pdf.setFontSize(14);pdf.setFont('helvetica','bold');pdf.text(name,14,42);y=49;
  }
  function page(name:string){pdf.addPage('a4','portrait');heading(name)}
  function table(name:string,headers:string[],widths:number[],data:unknown[][]){
    if(pdf.getNumberOfPages()===1&&!diagram&&!section)heading(name);else page(name);
    function header(){let x=14;pdf.setFillColor(224,236,243);pdf.rect(14,y,182,9,'F');pdf.setFont('helvetica','bold');pdf.setFontSize(8);headers.forEach((h,i)=>{pdf.text(h,x+2,y+5.8);x+=widths[i]});y+=9;}
    header();
    if(!data.length)data=[['No items in this section.']];
    for(let index=0;index<data.length;index++){
      pdf.setFont('helvetica','normal');pdf.setFontSize(8);
      const cells=widths.map((w,i)=>pdf.splitTextToSize(clean(data[index][i]),w-4));const height=Math.max(10,...cells.map(lines=>lines.length*4+4));
      if(y+height>277){page(name+' (continued)');header();pdf.setFont('helvetica','normal')}
      if(index%2===0){pdf.setFillColor(245,248,250);pdf.rect(14,y,182,height,'F')}
      let x=14;cells.forEach((lines,i)=>{pdf.text(lines,x+2,y+5);x+=widths[i]});y+=height;
    }
  }
  if(diagram){heading('Setup diagram');const w=pdf.internal.pageSize.getWidth(),h=pdf.internal.pageSize.getHeight();const scale=Math.min((w-28)/diagram.width,(h-75)/diagram.height);const iw=diagram.width*scale,ih=diagram.height*scale;pdf.addImage(diagram.png,'PNG',(w-iw)/2,51,iw,ih);pdf.setFontSize(9);pdf.setFont('helvetica','normal');pdf.text('Solid lines: wired   /   Purple dotted lines: wireless   /   Planning does not reserve inventory.',14,h-15)}
  const parts=packRows(doc);
  table('Parts & packing list',['Packed','Qty','Item','Asset code / cable length','Category'],[16,12,68,61,25],parts.map(r=>[doc.meta.packed[r.key]?'Yes':'[  ]',r.quantity,r.name,r.code||r.length||'-',r.kind]));
  table('Signal connection schedule',['From / output','To / input','Signal','Link / ID / length'],[60,60,24,38],doc.edges.map(e=>{const a=doc.nodes.find(n=>n.id===e.source),b=doc.nodes.find(n=>n.id===e.target);return [a?.data.name+'\n'+a?.data.outputs.find(p=>p.id===e.sourceHandle)?.name,b?.data.name+'\n'+b?.data.inputs.find(p=>p.id===e.targetHandle)?.name,e.data.type,[e.data.wireless?'WIRELESS':'Wired',e.data.label,!e.data.wireless&&e.data.length].filter(Boolean).join('\n')]}));
  if(doc.meta.notes){page('Production notes');pdf.setFont('helvetica','normal');pdf.setFontSize(10);for(const line of pdf.splitTextToSize(clean(doc.meta.notes),180)){if(y>277){page('Production notes (continued)');pdf.setFont('helvetica','normal');pdf.setFontSize(10)}pdf.text(line,14,y);y+=5}}
  for(let i=1;i<=pdf.getNumberOfPages();i++){pdf.setPage(i);const w=pdf.internal.pageSize.getWidth(),h=pdf.internal.pageSize.getHeight();pdf.setDrawColor(202,215,224);pdf.line(14,h-11,w-14,h-11);pdf.setTextColor(90);pdf.setFont('helvetica','normal');pdf.setFontSize(8);pdf.text('GWG TV / '+new Date().toLocaleDateString('en-CA',{timeZone:'America/Vancouver'}),14,h-6);pdf.text(i+' / '+pdf.getNumberOfPages(),w-14,h-6,{align:'right'})}
  return pdf;
}
