let activeUser = ''
let images = []
let filteredImages = []
let currentIndex = 0
let checked = {}       // { image_id: user_label }
let activeFilter = 'all'
let activeFolderId = 'all'

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
}

// ==========================
// LOAD FOLDERS → populate <select>
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
document.getElementById('user-select').addEventListener('change', (e) => {
  activeUser = e.target.value
  localStorage.setItem('activeUser', activeUser)
})
// ==========================
// LOAD IMAGES
// ==========================
async function loadImages() {
  try {
    const res = await fetch('/images')
    const data = await res.json()
    console.log("DATA images:", data)

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
    const res = await fetch('/checklist')
    const data = await res.json()
    console.log("DATA checklist:", data)

    checked = {}
    data.forEach(item => {
      checked[item.image_id] = item.user_label
    })
  } catch (err) {
    console.error('❌ loadChecklist error:', err)
  }
}

// ==========================
// FILTER + FOLDER — diterapkan bersama
// ==========================
function applyFilterAndFolder() {
  let result = images

  // Filter folder
  if (activeFolderId !== 'all') {
    result = result.filter(img => String(img.folder_id) === String(activeFolderId))
  }

  // Filter label
  if (activeFilter !== 'all') {
    result = result.filter(img => img.cvat_label === activeFilter)
  }

  filteredImages = result
  currentIndex = 0
  renderImage()
  updateHeader()
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

// ==========================
// UPDATE FILTER BUTTON ACTIVE (sesuai CSS: active-all, active-pruning, dll)
// ==========================
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
  document.getElementById('frame-counter').innerText =
    `${currentIndex + 1} / ${filteredImages.length}`

  updateSlider()

  const activeLabel = checked[img.id] || null
  updateLabelButtons(activeLabel)
  updateCheckedBadge(activeLabel)
  updateNavButtons()
}

// ==========================
// SLIDER — sync dengan currentIndex
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
// UPDATE LABEL BUTTONS (sesuai CSS: .selected + .check-dot.checked)
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
// UPDATE CHECKED BADGE DI FOTO (sesuai CSS: .checked-badge.pruning dll)
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
// UPDATE NAV BUTTONS (disable di ujung, sesuai CSS: .nav-btn:disabled)
// ==========================
function updateNavButtons() {
  document.getElementById('btn-prev').disabled = currentIndex === 0
  document.getElementById('btn-next').disabled =
    filteredImages.length === 0 || currentIndex === filteredImages.length - 1
}

// ==========================
// LABEL CLICK — toggle support
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
  }

  const activeLabel = checked[img.id] || null
  updateLabelButtons(activeLabel)
  updateCheckedBadge(activeLabel)
  updateHeader()
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
// DELETE /submit — uncheck
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
// TOAST (sesuai CSS: .toast .pruning .underpruning)
// ==========================
function showToast(label) {
  const toast = document.getElementById('toast')
  toast.classList.remove('show', 'pruning', 'underpruning')

  if (!label) return

  toast.className = `toast ${label}`
  toast.innerText = label === 'pruning' ? '✓ Ditandai: Pruning' : '✓ Ditandai: Underpruning'
  void toast.offsetWidth // reflow untuk reset animasi
  toast.classList.add('show')

  setTimeout(() => toast.classList.remove('show'), 2000)
}

// ==========================
// UPDATE HEADER COUNT + TOTAL
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