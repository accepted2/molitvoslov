import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {WebView} from 'react-native-webview';
import {useTextSelection} from '../../context/TextSelectionContext';
import {saveItem} from '../../services/savedItems';
import {classifySelection} from './SelectableSaveText';

// Matches the draggable start/end markers in the existing WebView prayer readers.
// The enclosing calendar/saint ScrollView remains responsible for scrolling.
let sequence = 0;
const htmlEscape = text => String(text || '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const number = (v, fallback, min, max) => Math.max(min, Math.min(max, Number(v) || fallback));

const selectionScript = String.raw`
(function(){
  var content=document.getElementById('text');
  var textNode=content.firstChild;
  var original=textNode ? textNode.nodeValue : '';
  var marks=document.getElementById('marks');
  var left=document.getElementById('left');
  var right=document.getElementById('right');
  var active=null,touch=null,timer=null,drag=null;
  function post(data){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(data));}
  function caret(x,y) {
    var range=document.caretRangeFromPoint ? document.caretRangeFromPoint(x,y) : null;
    if (!range && document.caretPositionFromPoint) {
      var p=document.caretPositionFromPoint(x,y);
      if(p){range=document.createRange();range.setStart(p.offsetNode,p.offset);}
    }
    if(!range || range.startContainer!==textNode)return null;
    return Math.max(0,Math.min(original.length,range.startOffset));
  }
  function draw() {
    marks.replaceChildren();
    if(!active || !textNode){left.style.display='none';right.style.display='none';return;}
    var range=document.createRange();
    range.setStart(textNode,active.start);
    range.setEnd(textNode,active.end);
    var rectangles=Array.from(range.getClientRects()).filter(function(r){return r.width>0;});
    if(!rectangles.length)return;
    var root=content.getBoundingClientRect();
    rectangles.forEach(function(r){
      var highlight=document.createElement('div');
      highlight.className='highlight';
      highlight.style.left=(r.left-root.left)+'px';
      highlight.style.top=(r.top-root.top)+'px';
      highlight.style.width=r.width+'px';highlight.style.height=r.height+'px';
      marks.appendChild(highlight);
    });
    var first=rectangles[0],last=rectangles[rectangles.length-1];
    left.style.display='block';right.style.display='block';
    left.style.left=(first.left-root.left-15)+'px';
    left.style.top=(first.bottom-root.top-5)+'px';
    right.style.left=(last.right-root.left-15)+'px';
    right.style.top=(last.bottom-root.top-5)+'px';
  }
  function select(a,b){
    var start=Math.max(0,Math.min(original.length,Math.min(a,b)));
    var end=Math.max(0,Math.min(original.length,Math.max(a,b)));
    if(start===end)return;
    active={start:start,end:end};draw();
    post({type:'selection',start:start,end:end});
  }
  function wordAt(pos){
    var i=Math.min(pos,original.length-1);
    if(i<0)return null;
    function letter(c){return !!c && !/[\s.,;!?«»"'()[\]{}—–…:]/.test(c);}
    if(!letter(original[i]) && i>0 && letter(original[i-1]))i--;
    if(!letter(original[i]))return null;
    var start=i,end=i+1;
    while(start>0&&letter(original[start-1]))start--;
    while(end<original.length&&letter(original[end]))end++;
    return {start:start,end:end};
  }
  function clear(send){
    if(timer)clearTimeout(timer);
    timer=null;touch=null;drag=null;active=null;
    draw();
    if(send)post({type:'clear'});
  }
  window.calendarClearSelection=function(){clear(false);};
  function measure(){
    var rect=content.getBoundingClientRect();
    post({type:'height',height:Math.ceil(Math.max(26,rect.height+4))});
    if(active)draw();
  }
  content.addEventListener('pointerdown',function(e){
    if(drag)return;
    if(active)clear(true);
    touch={id:e.pointerId,x:e.clientX,y:e.clientY};
    timer=setTimeout(function(){
      if(!touch)return;
      var pos=caret(touch.x,touch.y),word=pos===null?null:wordAt(pos);
      if(word)select(word.start,word.end);
      touch=null;timer=null;
    },400);
  },{passive:true});
  content.addEventListener('pointermove',function(e){
    if(!touch || touch.id!==e.pointerId)return;
    if(Math.abs(e.clientX-touch.x)>9||Math.abs(e.clientY-touch.y)>9){
      clearTimeout(timer);timer=null;touch=null;
    }
  },{passive:true});
  function finishTouch(e){
    if(touch && touch.id===e.pointerId){clearTimeout(timer);timer=null;touch=null;}
  }
  content.addEventListener('pointerup',finishTouch,{passive:true});
  content.addEventListener('pointercancel',finishTouch,{passive:true});
  function startDrag(side,e){
    if(!active)return;
    e.preventDefault();e.stopPropagation();
    drag={id:e.pointerId,side:side};
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function moveDrag(e){
    if(!drag || drag.id!==e.pointerId||!active)return;
    e.preventDefault();e.stopPropagation();
    var pos=caret(e.clientX,e.clientY);
    if(pos===null)return;
    if(drag.side==='left'){
      if(pos<active.end)select(pos,active.end);
      else{select(active.end,pos);drag.side='right';}
    }else{
      if(pos>active.start)select(active.start,pos);
      else{select(pos,active.start);drag.side='left';}
    }
  }
  function finishDrag(e){
    if(drag&&drag.id===e.pointerId){e.preventDefault();e.stopPropagation();drag=null;}
  }
  [[left,'left'],[right,'right']].forEach(function(pair){
    var node=pair[0],side=pair[1];
    node.addEventListener('pointerdown',function(e){startDrag(side,e);});
    node.addEventListener('pointermove',moveDrag);
    node.addEventListener('pointerup',finishDrag);
    node.addEventListener('pointercancel',finishDrag);
  });
  document.addEventListener('contextmenu',function(e){e.preventDefault();});
  window.addEventListener('resize',measure);
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(measure).observe(content);
  document.addEventListener('DOMContentLoaded',measure);
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(measure);
  setTimeout(measure,60);setTimeout(measure,250);
})();
`;

const buildHtml = (value, style) => {
  const s = StyleSheet.flatten(style) || {};
  const fontSize = number(s.fontSize,16,11,32);
  const lineHeight = number(s.lineHeight,26,15,52);
  const color = /^#[0-9a-fA-F]{6}$/.test(s.color) ? s.color : '#3E2A1D';
  const align = s.textAlign === 'justify' ? 'justify' : 'left';
  return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>' +
    '<style>*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}html,body{margin:0;padding:0;background:transparent;overflow:hidden}' +
    '#text{position:relative;white-space:pre-wrap;overflow-wrap:break-word;word-break:normal;font-family:Georgia,serif;' +
    'font-size:'+fontSize+'px;line-height:'+lineHeight+'px;color:'+color+';text-align:'+align+';' +
    '-webkit-user-select:none;user-select:none;touch-action:pan-y}' +
    '#marks{position:absolute;top:0;left:0;pointer-events:none;z-index:2}' +
    '.highlight{position:absolute;background:rgba(206,162,72,.38);border-radius:2px}' +
    '.handle{position:absolute;display:none;width:30px;height:35px;z-index:5;touch-action:none}' +
    '.handle:before{content:"";position:absolute;left:13px;top:2px;width:3px;height:17px;background:#936735;border-radius:2px}' +
    '.handle:after{content:"";position:absolute;left:7px;top:17px;width:15px;height:15px;border-radius:50%;background:#936735;border:2px solid #FFF4DE}' +
    '</style></head><body><div id="text">'+htmlEscape(value) +
    '<div id="marks"></div><div id="left" class="handle"></div><div id="right" class="handle"></div></div>' +
    '<script>'+selectionScript+'</script></body></html>';
};

export default function CalendarSelectionWebText({
  text, textStyle, sourceType, sourceId, anchorType, anchorId,
  sourceTitle, itemTitle, metadata = {}, fullSaveType = null,
}) {
  const [height,setHeight] = useState(34);
  const view = useRef(null);
  const selected = useRef(null);
  const id = useRef('calendar-web-selection-'+(++sequence));
  const {activateSelection,clearSelection} = useTextSelection();
  const value=String(text || '');
  const s=StyleSheet.flatten(textStyle)||{};
  const html=useMemo(()=>buildHtml(value,textStyle),[value,s.fontSize,s.lineHeight,s.color,s.textAlign]);
  const latest=useRef(null);
  latest.current={value,sourceType,sourceId,anchorType,anchorId,sourceTitle,itemTitle,metadata,fullSaveType};

  const clearWeb=useCallback(()=>{
    selected.current=null;
    view.current?.injectJavaScript('window.calendarClearSelection&&window.calendarClearSelection();true;');
  },[]);
  const save=useCallback(async()=>{
    const range=selected.current,p=latest.current;
    if(!range || !p)return {ok:false,message:'Нет активного выделения'};
    const excerpt=p.value.slice(range.start,range.end).trim();
    if(!excerpt)return {ok:false,message:'Пустое выделение'};
    try{
      await saveItem({
        save_type:classifySelection({text:p.value,range,fullSaveType:p.fullSaveType}),
        source_type:p.sourceType,source_id:p.sourceId,
        anchor_type:p.anchorType,anchor_id:p.anchorId,
        source_title:p.sourceTitle,item_title:p.itemTitle,
        text:excerpt,start_offset:range.start,end_offset:range.end,
        metadata:p.metadata,
      });
      clearWeb();
      return {ok:true};
    }catch(error){
      console.warn('[calendar fragment save]',error?.message||error);
      return {ok:false,message:'Не удалось сохранить'};
    }
  },[clearWeb]);
  const onMessage=useCallback(event=>{
    let data;
    try{data=JSON.parse(event.nativeEvent.data);}catch{return;}
    if(data?.type==='height'){
      const n=Number(data.height);
      if(Number.isFinite(n)&&n>0&&n<250000)setHeight(h=>Math.abs(h-n)>2?n:h);
    }else if(data?.type==='selection'){
      const a=Number(data.start),b=Number(data.end);
      if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||a>=b||b>latest.current.value.length)return;
      selected.current={start:a,end:b};
      activateSelection({id:id.current,count:b-a,tooLong:false,canSave:true,onSave:save,onClear:clearWeb});
    }else if(data?.type==='clear'){
      selected.current=null;
      clearSelection(id.current);
    }
  },[activateSelection,clearSelection,clearWeb,save]);
  useEffect(()=>()=>clearSelection(id.current),[clearSelection]);

  return (
    <View style={[styles.wrap,{height}]}>
      <WebView
        ref={view}
        source={{html,baseUrl:'about:blank'}}
        originWhitelist={['*']}
        javaScriptEnabled
        scrollEnabled={false}
        nestedScrollEnabled={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        overScrollMode="never"
        textZoom={100}
        onMessage={onMessage}
        style={styles.view}
        containerStyle={styles.view}
        setSupportMultipleWindows={false}
      />
    </View>
  );
}
const styles=StyleSheet.create({
  wrap:{width:'100%',overflow:'visible',backgroundColor:'transparent'},
  view:{flex:1,backgroundColor:'transparent'},
});
