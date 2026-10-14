// A small instrument adapter. Go owns surveyed destinations; Scene3D owns optics
// and sailing. Reading the public camera never takes control of the helm.
(function () {
  "use strict";
  const wrap=n=>((n%360)+360)%360;
  function sight(camera,places) {
    if(!camera||![camera.x,camera.z,camera.rotationY].every(Number.isFinite))return null;
    const bearing=wrap(-camera.rotationY*180/Math.PI);
    let target=null;
    for(const place of places) {
      const dx=place.x-camera.x,dz=place.z-camera.z,distance=Math.hypot(dx,dz);
      if(distance<12)continue;
      const direction=wrap(Math.atan2(dx,-dz)*180/Math.PI),offset=wrap(direction-bearing+180)-180;
      if(Math.abs(offset)>12||target&&Math.abs(offset)>=Math.abs(target.offset))continue;
      target={place,distance,offset};
    }
    return {bearing,target};
  }
  function mount() {
    const root=document.querySelector('.bgb');
    if(!root||root.dataset.spyglassMounted)return;
    root.dataset.spyglassMounted='true';
    const toggle=root.querySelector('[data-coast-spyglass]'),panel=root.querySelector('.bgb__spyglass');
    const plot=panel.querySelector('[data-coast-sight-plot]'),close=panel.querySelector('[data-coast-spyglass-close]');
    const places=JSON.parse(root.dataset.coastChartPlaces),directions=['N','NE','E','SE','S','SW','W','NW'];
    const text=(selector,value)=>{const node=panel.querySelector(selector);if(node.textContent!==value)node.textContent=value;};
    let active=false,timer=0,target=null,view=root.dataset.view;
    const scene=()=>root.querySelector('[data-gosx-scene3d-mounted]');
    function sample() {
      const node=scene(),handle=node?.__gosxScene3DHandle;
      const reading=sight(handle?.getCamera(),places);
      if(!reading)return;
      text('[data-coast-sight-bearing]',String(Math.round(reading.bearing)%360).padStart(3,'0')+'° '+directions[Math.round(reading.bearing/45)%8]);
      target=reading.target;
      text('[data-coast-sight-name]',target?target.place.name:'Open sea');
      text('[data-coast-sight-range]',target?'Chart bearing · '+(target.distance<1000?Math.round(target.distance)+' m':(target.distance/1000).toFixed(1)+' km')+' · '+(Math.abs(target.offset)<1?'on bearing':Math.round(Math.abs(target.offset))+'° '+(target.offset>0?'right':'left')):'Drag to look · bearings follow your view');
      plot.disabled=!target?.place.island;
    }
    function clock() {
      clearInterval(timer);timer=0;
      if(active&&!document.hidden){sample();timer=setInterval(sample,100);}
    }
    function set(value,focus=false) {
      const node=scene();
      if(value&&!node)return;
      if(document.pointerLockElement)document.exitPointerLock();
      active=value;panel.hidden=!value;toggle.setAttribute('aria-pressed',String(value));
      root.dataset.spyglass=String(value);
      if(value)for(const details of root.querySelectorAll('.bgb__tools > details'))details.open=false;
      node?.dispatchEvent(new CustomEvent('gosx:scene3d:optical-zoom',{detail:{factor:value?3:1}}));
      clock();
      if(focus)(value?node?.querySelector('canvas'):toggle)?.focus({preventScroll:true});
    }
    const ready=()=>{toggle.disabled=!scene();};
    const observer=new MutationObserver(ready);
    observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['data-gosx-scene3d-mounted']});ready();
    toggle.addEventListener('click',()=>set(!active,true));
    close.addEventListener('click',()=>set(false,true));
    plot.addEventListener('click',()=>{
      if(!target?.place.island)return;
      const place=target.place;set(false);
      root.dispatchEvent(new CustomEvent('blackglass:plot-course',{detail:{view:place.view}}));
    });
    root.addEventListener('gosx:scene3d:optical-zoom-state',event=>{
      if(event.target!==scene()||event.detail?.factor!==1||!active)return;
      active=false;panel.hidden=true;toggle.setAttribute('aria-pressed','false');root.dataset.spyglass='false';clock();
    });
    root.addEventListener('keydown',event=>{if(active&&event.key==='Escape'){event.preventDefault();event.stopPropagation();set(false,true);}},{capture:true});
    root.addEventListener('blackglass:view-changed',()=>{if(root.dataset.view!==view&&active)set(false);view=root.dataset.view;});
    root.addEventListener('click',event=>{if(active&&event.target.closest('[data-coast-pocket],[data-coast-reset-view],[data-gosx-scene-node^="shore-handheld"]'))set(false);},{capture:true});
    root.addEventListener('gosx:scene3d:input',event=>{if(active&&event.detail?.input?.targetID?.split('/')[0]==='shore-handheld')set(false);},{capture:true});
    for(const details of root.querySelectorAll('.bgb__tools > details'))details.addEventListener('toggle',()=>{if(details.open&&active)set(false);});
    document.addEventListener('visibilitychange',clock);
    window.addEventListener('pagehide',()=>{set(false);observer.disconnect();document.removeEventListener('visibilitychange',clock);});
    window.addEventListener('pageshow',event=>{if(event.persisted){observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['data-gosx-scene3d-mounted']});document.addEventListener('visibilitychange',clock);ready();}});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
