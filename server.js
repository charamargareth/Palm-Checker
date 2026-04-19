process.on('uncaughtException', err => {
  console.error('UNCAUGHT ERROR:', err)
})

process.on('unhandledRejection', err => {
  console.error('UNHANDLED PROMISE:', err)
})

const express = require('express')
const cors = require('cors')
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: './.env.local' })

const app = express()
app.use(cors())
app.use(express.json())
app.use(express.static(__dirname)) // ✅ serve semua file HTML/CSS/JS di folder yang sama

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

// ==========================
// GET semua images
// ==========================
app.get('/images', async (req, res) => {
  let allData = []
  let from = 0
  const batchSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from('images')
      .select('*')
      .range(from, from + batchSize - 1)

    if (error) {
      console.error('ERROR GET /images:', error)
      return res.status(500).json({ message: 'Gagal mengambil data images', detail: error })
    }

    allData = allData.concat(data)

    if (data.length < batchSize) break  // sudah habis
    from += batchSize
  }

  res.json(allData)
})

// ==========================
// GET semua checklist (untuk restore state saat refresh)
// ✅ FIX: Endpoint baru yang dibutuhkan app.js
// ==========================
app.get('/checklist', async (req, res) => {
  const { data, error } = await supabase
    .from('checklist')
    .select('image_id, user_label')

  if (error) {
    console.error('ERROR GET /checklist:', error)
    return res.status(500).json({ message: 'Gagal mengambil data checklist', detail: error })
  }

  res.json(data)
})

// ==========================
// POST submit label (upsert — tidak akan duplikat)
// ✅ FIX: Ganti insert biasa dengan upsert
// ==========================
app.post('/submit', async (req, res) => {
  const { image_id, user_label } = req.body

  // ✅ FIX: Validasi input
  if (!image_id || !user_label) {
    return res.status(400).json({ message: 'image_id dan user_label wajib diisi' })
  }

  const validLabels = ['pruning', 'underpruning']
  if (!validLabels.includes(user_label)) {
    return res.status(400).json({ message: `user_label tidak valid. Harus salah satu dari: ${validLabels.join(', ')}` })
  }

  // ✅ FIX: Upsert berdasarkan image_id supaya tidak duplikat
  // Pastikan kolom image_id di tabel checklist sudah di-set sebagai UNIQUE di Supabase
  const { error } = await supabase
    .from('checklist')
    .upsert(
      [{ image_id, user_label }],
      { onConflict: 'image_id' }
    )

  if (error) {
    console.error('ERROR POST /submit:', error)
    return res.status(500).json({ message: 'Gagal menyimpan label', detail: error })
  }

  res.json({ success: true })
})

// ==========================
// DELETE label (untuk toggle off / uncheck)
// ✅ FIX: Endpoint baru yang dibutuhkan app.js
// ==========================
app.delete('/submit', async (req, res) => {
  const { image_id } = req.body

  // ✅ FIX: Validasi input
  if (!image_id) {
    return res.status(400).json({ message: 'image_id wajib diisi' })
  }

  const { error } = await supabase
    .from('checklist')
    .delete()
    .eq('image_id', image_id)

  if (error) {
    console.error('ERROR DELETE /submit:', error)
    return res.status(500).json({ message: 'Gagal menghapus label', detail: error })
  }

  res.json({ success: true })
})

// ==========================
// GET random image (utility)
// ==========================
app.get('/random-image', async (req, res) => {
  const { data, error } = await supabase
    .from('images')
    .select('*')

  if (error) {
    console.error('ERROR GET /random-image:', error)
    return res.status(500).json({ message: 'Gagal mengambil data', detail: error })
  }

  if (!data || data.length === 0) {
    return res.status(404).json({ message: 'Tidak ada data gambar' })
  }

  const random = data[Math.floor(Math.random() * data.length)]
  res.json(random)
})

app.get('/folders', async (req, res) => {
  const { data, error } = await supabase
    .from('folders')
    .select('*')
    .order('id')

  if (error) return res.status(500).json({ message: 'Gagal ambil folders', detail: error })
  res.json(data)
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
})