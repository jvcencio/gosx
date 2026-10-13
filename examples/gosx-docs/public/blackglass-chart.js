// Instruments subscribe to the vessel's public state contract. The scene keeps
// ownership of motion; the server authors the chart and its survey locations.
(function () {
  "use strict";
  function mount() {
    const root=document.querySelector('.bgb');
    if(!root || root.dataset.chartMounted)return;
    root.dataset.chartMounted='true';
    const chart=root.querySelector('.bgb__chart'),journal=root.querySelector('.bgb__journal'),map=chart.querySelector('svg');
    const hold=chart.querySelector('[data-coast-hold]'),helm=chart.querySelector('[data-coast-chart-helm]'),sail=chart.querySelector('[data-coast-chart-sail]');
    const input=chart.querySelector('[data-coast-course]');
    const land=chart.querySelector("[data-coast-land]"),survey=chart.querySelector("[data-coast-survey]");
    let state=null,destination=null,overview=false,arrival=false,departure=false,lastNavigation=0,passage=[];
    const exit=JSON.parse(root.dataset.coastHarborExit);
    const bearingTo=point=>((Math.atan2(point.x-state.position.x,-(point.z-state.position.z))*180/Math.PI)+360)%360;
    const places=JSON.parse(root.dataset.coastChartPlaces);
    function route(place) {
      if(state?.course!==null)command('release-course');
      destination=place;arrival=false;departure=!!state&&Math.hypot(state.position.x-places.find(p=>p.view==="ship").x,state.position.z-places.find(p=>p.view==="ship").z)<45;
      passage=[...(departure?[exit]:[]),...((state?.position.z>-230&&place.route)?place.route:[])].map(p=>({x:p[0],z:p[1]}));
      departure=passage.length>0;
      if(state)input.value=String(Math.round(bearingTo(passage[0]||place)));
      text("[data-coast-destination]",place.name+" · course plotted · take the helm and hold course");
    }
    const text=(selector,value)=>{const node=chart.querySelector(selector);if(node.textContent!==value)node.textContent=value;};
    const degrees=n=>String(Math.round(n)%360).padStart(3,'0')+'°';
    function command(action,values={}) {
      const scene=root.querySelector('[data-gosx-scene3d-mounted]');
      if(!state || !scene)return;
      scene.dispatchEvent(new CustomEvent('gosx:scene3d:vessel-command',{detail:{nodeId:state.nodeId,action,...values}}));
    }
    for(const panel of [chart,journal])panel.addEventListener('toggle',()=>{
      if(!panel.open)return;
      if(document.pointerLockElement)document.exitPointerLock();
      (panel===chart?journal:chart).open=false;
    });
    const namespace='http://www.w3.org/2000/svg';
    for(const place of places) {
      const link=document.createElementNS(namespace,'a'),dot=document.createElementNS(namespace,'circle'),label=document.createElementNS(namespace,'text');
      link.setAttribute('href',place.island?'#coast-course':'?view='+encodeURIComponent(place.view)+'&period='+encodeURIComponent(root.dataset.period));
      if(place.island)link.addEventListener('click',event=>{event.preventDefault();route(place);input.focus();});else link.dataset.coastView=place.view;
      link.setAttribute('aria-label',(place.island?'Plot course to ':'Visit ')+place.name);
      dot.setAttribute('cx',place.x);dot.setAttribute('cy',place.z);dot.setAttribute('r','1.2');
      label.setAttribute('x',place.x+2);label.setAttribute('y',place.z-2);label.textContent=place.name;
      link.append(dot,label);root.querySelector('[data-coast-map-places]').append(link);
      const visit=document.createElement(place.island?'button':'a');
      if(place.island) {visit.type='button';visit.dataset.coastIsland=place.view;visit.addEventListener('click',()=>route(place));}
      else {visit.href=link.getAttribute('href');visit.dataset.coastView=place.view;}visit.textContent=place.name;
      chart.querySelector('[data-coast-chart-links]').append(visit);
    }
    root.addEventListener('gosx:scene3d:vessel-state',event=>{
      const d=event.detail,p=d&&d.position;
      if(!p || ![p.x,p.z,d.bearing,d.speed,d.trim,d.distance,d.windFrom,d.windStrength].every(Number.isFinite)
        || (d.course!==null&&!Number.isFinite(d.course)) || typeof d.nodeId!=='string' || !['moored','deck','sailing'].includes(d.mode))return;
      state=d;
      map.setAttribute('viewBox',overview?'-245 -430 600 480':[p.x-80,p.z-60,160,120].join(' '));
      root.querySelector('[data-coast-map-ship]').setAttribute('transform',`translate(${p.x} ${p.z}) rotate(${d.bearing}) scale(${overview?3:1})`);
      text('[data-coast-bearing]',degrees(d.bearing));text('[data-coast-speed]',d.speed.toFixed(1)+' m/s');
      text('[data-coast-wind]',degrees(d.windFrom)+' · '+d.windStrength.toFixed(0)+' m/s');
      text('[data-coast-distance]',d.distance<1000?Math.round(d.distance)+' m':(d.distance/1000).toFixed(2)+' km');
      const active=d.mode==='sailing',held=d.course!==null;
      helm.disabled=false;hold.disabled=!active;sail.disabled=!active;
      helm.textContent=active?(d.following?'Leave helm':'Return to helm'):arrival?'Return to ship':'Pilot ship';
      land.disabled=!d.landing;land.textContent=d.landing?'Step ashore · '+(places.find(place=>place.view===d.landing)?.name||'landing'):'Step ashore';
      if(destination) {
        if(passage.length&&held&&Math.hypot(p.x-passage[0].x,p.z-passage[0].z)<20) {passage.shift();departure=passage.length>0;const next=bearingTo(passage[0]||destination);input.value=String(Math.round(next));command('course',{bearing:next});}

        const distance=Math.hypot(destination.x-p.x,destination.z-p.z),bearing=((Math.atan2(destination.x-p.x,-(destination.z-p.z))*180/Math.PI)+360)%360;
        text('[data-coast-destination]',arrival?'Explore '+destination.name+' · return to the ship when ready':destination.name+' · '+Math.round(distance)+' m · '+degrees(bearing)+(departure?' · following the safe passage':distance<55?' · landing ahead, slow down':''));
        if(!arrival&&held&&distance<30&&d.trim>0)command('trim',{trim:0});
        else if(!arrival&&held&&d.trim>0&&performance.now()-lastNavigation>1000) {
          lastNavigation=performance.now();const next=bearingTo(passage[0]||destination);
          queueMicrotask(()=>{if(state.course!==null)command('course',{bearing:next});});
        }
      }
      sail.textContent=d.trim>.95?'Lower sail':'Full sail';hold.textContent=held?'Release course':'Hold course';
      hold.setAttribute('aria-pressed',String(held));
      text('[data-coast-chart-status]',d.grounded?'Grounded · steer toward deeper water':held?'Holding '+degrees(d.course)+' · '+(d.following?'manual steering takes over':'voyage continues'):active?(d.following?'At the helm · set a course or steer freely':'Ship sailing · return to the helm when ready'):'Board the ship to start your voyage.');
    });
    helm.addEventListener('click',()=>{arrival=false;command('helm');});
    land.addEventListener('click',()=>{if(!state?.landing)return;arrival=true;command('land');chart.open=false;});
    survey.addEventListener('click',()=>{overview=!overview;map.dataset.survey=String(overview);survey.setAttribute('aria-pressed',String(overview));survey.textContent=overview?'Follow ship':'Show archipelago';map.setAttribute('viewBox',overview?'-245 -430 600 480':state?[state.position.x-80,state.position.z-60,160,120].join(' '):'-70 -80 160 120');});
    input.addEventListener('input',()=>{destination=null;departure=false;passage=[];text('[data-coast-destination]','Manual course selected.');});
    sail.addEventListener('click',()=>command('trim',{trim:state.trim>.95?0:1}));
    hold.addEventListener('click',()=>{
      if(state.course!==null) {command('release-course');return;}
      const bearing=input.valueAsNumber;
      if(!Number.isFinite(bearing)||bearing<0||bearing>360) {text('[data-coast-chart-status]','Choose a course from 0 to 360 degrees.');input.focus();return;}
      command('course',{bearing});
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
