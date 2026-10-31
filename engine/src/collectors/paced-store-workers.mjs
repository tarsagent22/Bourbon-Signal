// Small store-level concurrency with a single serialized request-start gate.
// Callers check cooldowns after admission, so a queued request cannot race past
// a denial already observed by another worker.
export function pacedRequestGate({intervalMs=500, sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)), signal}={}) {
  let tail=Promise.resolve(), started=false;
  return () => {
    const admission=tail.then(async()=>{
      signal?.throwIfAborted();
      if(started) await sleep(intervalMs);
      signal?.throwIfAborted(); started=true;
    });
    tail=admission.catch(()=>{});
    return admission;
  };
}

export async function forEachStoreBounded(items, worker, concurrency=2) {
  if(!Number.isInteger(concurrency)||concurrency<1||concurrency>2)throw new Error('Unreviewed store concurrency');
  let index=0,failed=false;
  const results=await Promise.allSettled(Array.from({length:Math.min(concurrency,items.length)},async()=>{
    while(!failed&&index<items.length){const position=index++;try{await worker(items[position],position);}catch(error){failed=true;throw error;}}
  }));
  const failure=results.find(result=>result.status==='rejected');
  if(failure)throw failure.reason;
}
