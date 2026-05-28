let activeUser = ''
let images = []
let filteredImages = []
let currentIndex = 0
let checked = {}
let activeFilter = 'all'
let activeFolderId = 'all'

// Simpan posisi terakhir per filter per user
// { 'all': 32, 'pruning': 5, 'underpruning': 2, 'ragu': 0 }
let lastPosition = { all: 0, pruning: 0, underpruning: 0, ragu: 0 }

const TOTAL_SEMUA = 1263

// ==========================
// INIT
// ==========================
async function init() {
  const savedUser = localStorage.getItem('activeUser')
  if (savedUser) {
    activeUser = savedUser
    document.getElementById('user-select').value = savedUser
  }

  await loadChecklist()
  await loadFolders()
  await loadImages()
  updateFilterButtons()
  updateProgressBar()
}

// ==========================
// LOAD FOLDERS
// ==========================
async function loadFolders() {
  try {
    const res = await fetch('/folders')
    const folders = await res.json()
    const select = document.getElementById('folder-select')
    folders.forEach(f => {
      const opt = document.createElement('option')
      opt.value = f.id
      opt.textContent = f.name
      select.appendChild(opt)
    })
  } catch (err) {
    console.error('❌ loadFolders error:', err)
  }
}

// ==========================
// FOLDER SELECT CHANGE
// ==========================
document.getElementById('folder-select').addEventListener('change', (e) => {
  activeFolderId = e.target.value
  applyFilterAndFolder()
})

document.getElementById('user-select').addEventListener('change', async (e) => {
  activeUser = e.target.value
  localStorage.setItem('activeUser', activeUser)
  checked = {}
  lastPosition = { all: 0, pruning: 0, underpruning: 0, ragu: 0 }
  currentIndex = 0
  await loadChecklist()
  recalcLastPosition()
  applyFilterAndFolder()
  updateHeader()
  updateProgressBar()
})

// ==========================
// LOAD IMAGES
// ==========================
async function loadImages() {
  try {
    const res = await fetch('/images')
    const data = await res.json()
    images = data
    applyFilterAndFolder()
    updateHeader()
  } catch (err) {
    console.error('❌ loadImages error:', err)
  }
}

// ==========================
// RESTORE CHECKLIST STATE
// ==========================
async function loadChecklist() {
  try {
    if (!activeUser) return
    const res = await fetch(`/checklist?user=${activeUser}`)
    const data = await res.json()
    checked = {}
    data.forEach(item => {
      checked[item.image_id] = item.user_label
    })
    // Hitung lastPosition dari data checklist
    recalcLastPosition()
  } catch (err) {
    console.error('❌ loadChecklist error:', err)
  }
}

// ==========================
// HITUNG POSISI TERAKHIR PER FILTER
// ==========================
function recalcLastPosition() {
  lastPosition = { all: 0, pruning: 0, underpruning: 0, ragu: 0 }

  // Untuk filter 'all': cari index terakhir di images yang sudah dichecklist
  const allFiltered = getFilteredImages('all', 'all')
  for (let i = allFiltered.length - 1; i >= 0; i--) {
    if (checked[allFiltered[i].id]) {
      lastPosition['all'] = i
      break
    }
  }

  // Untuk filter pruning, underpruning, ragu
  for (const filter of ['pruning', 'underpruning', 'ragu']) {
    const filtered = getFilteredImages(filter, 'all')
    for (let i = filtered.length - 1; i >= 0; i--) {
      if (checked[filtered[i].id]) {
        lastPosition[filter] = i
        break
      }
    }
  }
}

// ==========================
// HELPER: GET FILTERED IMAGES
// ==========================
function getFilteredImages(filter, folderId) {
  let result = images
  if (folderId !== 'all') {
    result = result.filter(img => String(img.folder_id) === String(folderId))
  }
  if (filter !== 'all') {
    result = result.filter(img => img.cvat_label === filter)
  }
  return result
}

// ==========================
// UPDATE PROGRESS BAR (mengikuti filter aktif)
// ==========================
function updateProgressBar() {
  const container = document.getElementById('progress-container')
  const bar = document.getElementById('progress-bar')
  const text = document.getElementById('progress-text')
  const pct = document.getElementById('progress-pct')
  const last = document.getElementById('progress-last')
  const btnJump = document.getElementById('btn-jump')

  if (!activeUser) {
    container.style.display = 'none'
    return
  }

  container.style.display = 'block'

  const total = filteredImages.length
  if (total === 0) {
    bar.style.width = '0%'
    text.innerText = '0 dari 0'
    pct.innerText = '0%'
    last.innerText = 'Tidak ada gambar'
    return
  }

  const pos = lastPosition[activeFilter] || 0
  const displayPos = total > 0 ? Math.min(pos + 1, total) : 0
  const percentage = total > 0 ? (displayPos / total) * 100 : 0

  bar.style.width = `${percentage}%`
  text.innerText = `ke-${displayPos} dari ${total}`
  pct.innerText = `${percentage.toFixed(1)}%`

  // Label filter untuk display
  const filterLabel = {
    all: 'Semua',
    pruning: 'Pruning',
    underpruning: 'Underpruning',
    ragu: 'Ragu'
  }[activeFilter]

  // Cari nama file terakhir
  const lastImg = filteredImages[pos]
  if (lastImg && checked[lastImg.id]) {
    const labelText = checked[lastImg.id] === 'pruning' ? 'Pruning' :
                      checked[lastImg.id] === 'underpruning' ? 'Underpruning' : 'Ragu'
    last.innerText = `Terakhir [${filterLabel}]: frame ke-${displayPos} (${labelText})`
    btnJump.style.display = 'block'
    btnJump.onclick = () => {
      currentIndex = pos
      renderImage()
    }
  } else {
    last.innerText = `Belum ada label di filter ${filterLabel}`
    btnJump.style.display = 'none'
  }
}

// ==========================
// FILTER + FOLDER
// ==========================
function applyFilterAndFolder() {
  let result = images
  if (activeFolderId !== 'all') {
    result = result.filter(img => String(img.folder_id) === String(activeFolderId))
  }
  if (activeFilter !== 'all') {
    result = result.filter(img => img.cvat_label === activeFilter)
  }
  filteredImages = result
  currentIndex = 0
  renderImage()
  updateHeader()
  updateProgressBar()
}

// ==========================
// FILTER BUTTON CLICK
// ==========================
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    activeFilter = btn.dataset.filter
    applyFilterAndFolder()
    updateFilterButtons()
  })
})

function updateFilterButtons() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    const filter = btn.dataset.filter
    btn.classList.remove('active-all', 'active-pruning', 'active-underpruning', 'active-ragu')
    if (filter === activeFilter) {
      btn.classList.add(`active-${filter}`)
    }
  })
}

// ==========================
// RENDER IMAGE
// ==========================
function renderImage() {
  if (!filteredImages.length) {
    document.getElementById('main-photo').src = ''
    document.getElementById('frame-name').innerText = '(tidak ada gambar)'
    document.getElementById('frame-counter').innerText = '0 / 0'
    updateSlider()
    updateLabelButtons(null)
    updateCheckedBadge(null)
    updateNavButtons()
    return
  }

  const img = filteredImages[currentIndex]
  document.getElementById('main-photo').src = img.image_url
  document.getElementById('frame-name').innerText = img.filename
  document.getElementById('frame-counter').innerText = `${currentIndex + 1} / ${filteredImages.length}`

  updateSlider()
  const activeLabel = checked[img.id] || null
  updateLabelButtons(activeLabel)
  updateCheckedBadge(activeLabel)
  updateNavButtons()
}

// ==========================
// SLIDER
// ==========================
function updateSlider() {
  const slider = document.getElementById('img-slider')
  const sliderNum = document.getElementById('slider-num')
  const total = filteredImages.length
  slider.min = 0
  slider.max = total > 0 ? total - 1 : 0
  slider.value = currentIndex
  slider.disabled = total === 0
  sliderNum.innerText = total > 0 ? currentIndex + 1 : 0
}

document.getElementById('img-slider').addEventListener('input', (e) => {
  currentIndex = parseInt(e.target.value)
  renderImage()
})

// ==========================
// UPDATE LABEL BUTTONS
// ==========================
function updateLabelButtons(activeLabel) {
  const btnPruning = document.getElementById('btn-pruning')
  const btnUnder = document.getElementById('btn-under')
  const dotPruning = document.getElementById('dot-pruning')
  const dotUnder = document.getElementById('dot-under')
  btnPruning.classList.toggle('selected', activeLabel === 'pruning')
  btnUnder.classList.toggle('selected', activeLabel === 'underpruning')
  dotPruning.classList.toggle('checked', activeLabel === 'pruning')
  dotUnder.classList.toggle('checked', activeLabel === 'underpruning')
}

// ==========================
// UPDATE CHECKED BADGE
// ==========================
function updateCheckedBadge(activeLabel) {
  const badge = document.getElementById('checked-badge')
  if (!activeLabel) {
    badge.style.display = 'none'
    badge.className = 'checked-badge'
    return
  }
  badge.style.display = 'block'
  badge.className = `checked-badge ${activeLabel}`
  badge.innerText = activeLabel === 'pruning' ? '✓ Pruning' : '✓ Underpruning'
}

// ==========================
// UPDATE NAV BUTTONS
// ==========================
function updateNavButtons() {
  document.getElementById('btn-prev').disabled = currentIndex === 0
  document.getElementById('btn-next').disabled =
    filteredImages.length === 0 || currentIndex === filteredImages.length - 1
}

// ==========================
// LABEL CLICK
// ==========================
async function selectLabel(label) {
  if (!activeUser) {
    alert('Pilih nama dulu sebelum checklist!')
    return
  }
  const img = filteredImages[currentIndex]
  if (!img) return

  const currentLabel = checked[img.id]
  if (currentLabel === label) {
    await deleteLabel(img.id)
    delete checked[img.id]
    showToast(null)
  } else {
    await submitLabel(img.id, label, activeUser)
    checked[img.id] = label
    showToast(label)
    // Update lastPosition untuk filter yang aktif
    if (currentIndex > (lastPosition[activeFilter] || 0)) {
      lastPosition[activeFilter] = currentIndex
    }
    // Update juga lastPosition 'all'
    const allFiltered = getFilteredImages('all', activeFolderId)
    const globalIdx = allFiltered.findIndex(i => i.id === img.id)
    if (globalIdx > (lastPosition['all'] || 0)) {
      lastPosition['all'] = globalIdx
    }
  }

  const activeLabel = checked[img.id] || null
  updateLabelButtons(activeLabel)
  updateCheckedBadge(activeLabel)
  updateHeader()
  updateProgressBar()
}

// ==========================
// POST /submit
// ==========================
async function submitLabel(image_id, user_label, user_name) {
  try {
    const res = await fetch('/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_id, user_label, user_name })
    })
    const data = await res.json()
    if (!res.ok) console.error('❌ submitLabel error:', data)
  } catch (err) {
    console.error('❌ submitLabel fetch error:', err)
  }
}

// ==========================
// DELETE /submit
// ==========================
async function deleteLabel(image_id) {
  try {
    const res = await fetch('/submit', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_id })
    })
    const data = await res.json()
    if (!res.ok) console.error('❌ deleteLabel error:', data)
  } catch (err) {
    console.error('❌ deleteLabel fetch error:', err)
  }
}

// ==========================
// TOAST
// ==========================
function showToast(label) {
  const toast = document.getElementById('toast')
  toast.classList.remove('show', 'pruning', 'underpruning')
  if (!label) return
  toast.className = `toast ${label}`
  toast.innerText = label === 'pruning' ? '✓ Ditandai: Pruning' : '✓ Ditandai: Underpruning'
  void toast.offsetWidth
  toast.classList.add('show')
  setTimeout(() => toast.classList.remove('show'), 2000)
}

// ==========================
// UPDATE HEADER COUNT
// ==========================
function updateHeader() {
  const total = filteredImages.length
  const doneCount = filteredImages.filter(img => checked[img.id]).length
  document.getElementById('checked-count').innerText = doneCount
  document.getElementById('checked-total').innerText = `/ ${total} dicek`
}

// ==========================
// TOMBOL LABEL
// ==========================
document.getElementById('btn-pruning').onclick = () => selectLabel('pruning')
document.getElementById('btn-under').onclick = () => selectLabel('underpruning')

// ==========================
// NAVIGASI PREV / NEXT
// ==========================
document.getElementById('btn-next').onclick = () => {
  if (currentIndex < filteredImages.length - 1) {
    currentIndex++
    renderImage()
  }
}
document.getElementById('btn-prev').onclick = () => {
  if (currentIndex > 0) {
    currentIndex--
    renderImage()
  }
}

// ==========================
// START
// ==========================
init()

function exportFolder() {
  if (activeFolderId === 'all') {
    alert('Pilih folder dulu sebelum export!')
    return
  }
  window.open(`/export/${activeFolderId}`, '_blank')
}