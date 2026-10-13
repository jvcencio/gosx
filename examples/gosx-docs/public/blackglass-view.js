// Presentation links update one mounted world; the vessel keeps its own clock.
(function () {
  "use strict";
  function mount() {
    const root=document.querySelector('.bgb');
    if(!root || root.dataset.viewMounted)return;
    root.dataset.viewMounted='true';
    let request=0,revision=0,pending=null,vessel=null;
    const scene=()=>root.querySelector('[data-gosx-scene3d-mounted]');
    root.addEventListener('gosx:scene3d:vessel-state',event=>{vessel=event.detail;root.dataset.coastFollowing=String(vessel.following);});
    const controls=root.querySelector('.bgb__controls');
    const spaceControls=()=>root.style.setProperty('--bgb-helm-bottom',(innerHeight-controls.getBoundingClientRect().top+14)+'px');
    const observer=typeof ResizeObserver==='function'?new ResizeObserver(spaceControls):null;
    observer?.observe(controls);window.addEventListener('resize',spaceControls);spaceControls();
    root.addEventListener('gosx:scene3d:commands-applied',event=>{
      if(Number.isSafeInteger(event.detail?.revision))revision=Math.max(revision,event.detail.revision);
    });
    function refreshLinks() {
      for(const link of root.querySelectorAll('a[data-coast-view],a[data-coast-period]')) {
        const url=new URL(location.href);
        url.searchParams.set('view',link.dataset.coastView||root.dataset.view);
        url.searchParams.set('period',link.dataset.coastPeriod||root.dataset.period);
        link.setAttribute('href',url.pathname+url.search);
        const selected=link.dataset.coastView?link.dataset.coastView===root.dataset.view:link.dataset.coastPeriod===root.dataset.period;
        if(selected)link.setAttribute('aria-current','true');else link.removeAttribute('aria-current');
      }
    }
    async function update(view,period,move,historyChange=true) {
      const node=scene(),handle=node?.__gosxScene3DHandle;
      if(!handle?.setCamera)return false;
      const token=++request;
      pending?.abort();pending=new AbortController();
      root.setAttribute('aria-busy','true');
      try {
        const query=new URLSearchParams({view,period,from:root.dataset.period});
        const response=await fetch('/api/blackglass-view?'+query,{signal:pending.signal});
        if(!response.ok)throw new Error('presentation unavailable');
        const next=await response.json();
        if(token!==request || !Array.isArray(next.commands))return true;
        if(next.commands.length)node.dispatchEvent(new CustomEvent('gosx:scene3d:commands',{detail:{revision:++revision,commands:next.commands}}));
        if(move) {
          if(next.view==='ship'&&vessel?.mode==='sailing') {
            if(!vessel.following)node.dispatchEvent(new CustomEvent('gosx:scene3d:vessel-command',{detail:{nodeId:vessel.nodeId,action:'helm'}}));
          } else handle.setCamera({x:0,y:0,z:0,rotationX:0,rotationY:0,rotationZ:0,...next.camera});
          if(document.pointerLockElement)document.exitPointerLock();
          root.querySelector('.bgb__chart').open=false;
        }
        root.dataset.view=next.view;root.dataset.period=next.period;
        const canvas=node.querySelector('canvas');if(canvas)canvas.setAttribute('aria-label',next.label);
        if(historyChange) {
          const url=new URL(location.href);url.searchParams.set('view',next.view);url.searchParams.set('period',next.period);
          if(url.href!==location.href)history.pushState(null,'',url);
        }
        refreshLinks();
        root.dispatchEvent(new CustomEvent('blackglass:view-changed',{detail:{view:next.view,period:next.period},bubbles:true}));
      } catch(error) {
        if(error.name!=='AbortError')root.querySelector('[data-coast-status]').textContent='The view could not load. Your voyage continues; try again.';
      } finally {if(token===request)root.removeAttribute('aria-busy');}
      return true;
    }
    root.addEventListener('click',event=>{
      if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
      const link=event.target.closest('[data-coast-view],[data-coast-period],[data-coast-reset-view]');
      if(!link || !scene()?.__gosxScene3DHandle?.setCamera)return;
      event.preventDefault();
      update(link.dataset.coastView||root.dataset.view,link.dataset.coastPeriod||root.dataset.period,!link.hasAttribute('data-coast-period'));
    });
    root.addEventListener('keydown',event=>{
      if(event.code!=='Home'||event.target!==scene()?.querySelector('canvas'))return;
      event.preventDefault();event.stopImmediatePropagation();
      update(root.dataset.view,root.dataset.period,true);
    },true);
    window.addEventListener('popstate',()=>{
      const q=new URL(location.href).searchParams,view=q.get('view')||'shore';
      update(view,q.get('period')||'golden-hour',view!==root.dataset.view,false);
    });
    window.addEventListener('pagehide',()=>{++request;pending?.abort();observer?.disconnect();},{once:true});
    refreshLinks();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
