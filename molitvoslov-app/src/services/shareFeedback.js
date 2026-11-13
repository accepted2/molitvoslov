// A single application-themed dialog host for all share preparations.
const listeners=new Set();
let current={visible:false};
export const subscribeShareFeedback=listener=>{
  listeners.add(listener);
  listener(current);
  return ()=>listeners.delete(listener);
};
export const showShareFeedback=details=>{
  current={visible:true,...details};
  listeners.forEach(listener=>listener(current));
};
export const hideShareFeedback=()=>{
  current={visible:false};
  listeners.forEach(listener=>listener(current));
};
