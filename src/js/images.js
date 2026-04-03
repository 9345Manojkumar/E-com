/* Palm Legacy – Product Images */

let _currentImgs = []; // [{src: base64}]  index 0 = primary

function getCurrentImgs(){ return [..._currentImgs]; }

function renderImgThumbs(imgs){
  _currentImgs = (imgs||[]).map(img=>({src:img.src||img}));
  _redrawThumbs();
}

function _redrawThumbs(){
  const wrap = document.getElementById("imgThumbs");
  const zone = document.getElementById("imgUploadZone");
  if(!wrap) return;

  // Build thumbnails
  const thumbsHtml = _currentImgs.map((img,i)=>`
    <div class="img-thumb ${i===0?'is-primary':''}" onclick="setPrimaryImg(${i})" title="${i===0?'Primary image':'Click to set as primary'}">
      <img src="${img.src}" alt="Image ${i+1}"/>
      <div class="img-thumb-num">${i+1}</div>
      ${i===0?'<div class="img-thumb-primary">⭐ PRIMARY</div>':''}
      <button class="img-thumb-del" onclick="event.stopPropagation();removeImg(${i})" title="Remove">✕</button>
    </div>`).join('');

  // Add more button (always visible when images exist)
  const addBtn = _currentImgs.length > 0 ? `
    <div class="img-add-btn" title="Add more images">
      <input type="file" accept="image/*" multiple onchange="handleImgUpload(event)"/>
      <span style="font-size:24px">+</span>
      <span>Add</span>
    </div>` : '';

  wrap.innerHTML = thumbsHtml + addBtn;

  // Show/hide upload zone
  if(zone) zone.style.display = _currentImgs.length ? 'none' : 'block';

  // Count badge
  const countEl = document.getElementById("imgCount");
  if(countEl) countEl.textContent = _currentImgs.length
    ? `${_currentImgs.length} image${_currentImgs.length>1?'s':''}`
    : '';
}

function handleImgUpload(event){
  const files = Array.from(event.target.files);
  if(!files.length) return;
  let loaded = 0;
  const MAX = 10;
  const remaining = MAX - _currentImgs.length;
  const toLoad = files.slice(0, remaining);
  if(files.length > remaining) showAdminToast(`⚠️ Max ${MAX} images. Added first ${remaining}.`);
  if(!toLoad.length){ showAdminToast(`⚠️ Max ${MAX} images reached`); return; }
  toLoad.forEach(file => {
    if(!file.type.startsWith('image/')){ loaded++; return; }
    const reader = new FileReader();
    reader.onload = e => {
      _currentImgs.push({src: e.target.result});
      loaded++;
      if(loaded === toLoad.length) _redrawThumbs();
    };
    reader.readAsDataURL(file);
  });
  event.target.value = "";
}

function setPrimaryImg(idx){
  if(idx === 0){ showAdminToast('⭐ Already the primary image'); return; }
  const [item] = _currentImgs.splice(idx, 1);
  _currentImgs.unshift(item);
  _redrawThumbs();
  showAdminToast("⭐ Image " + (idx+1) + " set as primary!");
}

function removeImg(idx){
  _currentImgs.splice(idx, 1);
  _redrawThumbs();
  showAdminToast("🗑 Image removed" + (_currentImgs.length ? ` · ${_currentImgs.length} remaining` : ' · No images'));
}

// Drag-over highlight for upload zone
document.addEventListener('dragover', function(e){
  if(document.getElementById('prodModal')?.classList.contains('open')){
    const zone = document.getElementById('imgUploadZone');
    if(zone && zone.style.display !== 'none') zone.style.borderColor = 'var(--gold)';
  }
});
document.addEventListener('dragleave', function(){
  const zone = document.getElementById('imgUploadZone');
  if(zone) zone.style.borderColor = '';
});