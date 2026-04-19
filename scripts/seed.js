const { createClient } = require('@supabase/supabase-js')
const { v2: cloudinary } = require('cloudinary')
require('dotenv').config({ path: './.env.local' })

// ======================
// 🔗 CONFIG
// ======================

// Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

// Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

// ======================
// ✅ VALIDASI ENV
// ======================
function validateEnv() {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_KEY',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET'
  ]

  const missing = required.filter(key => !process.env[key])

  if (missing.length > 0) {
    throw new Error(`❌ ENV tidak lengkap. Yang hilang: ${missing.join(', ')}`)
  }
}

// ======================
// 🧠 HELPER FUNCTIONS
// ======================

// ✅ FIX: Ambil cvat_label dari semua bagian setelah "sawitN_sawit_"
// Supaya label seperti "under_pruning" (dengan underscore) tetap terbaca benar
function parseFolder(folderName) {
  const parts = folderName.split('_')

  // parts[0] = "sawitN", parts[1] = "sawit", parts[2..] = label
  const folder_id = parseInt(parts[0].replace('sawit', ''))
  const cvat_label = parts.slice(2).join('_') // ✅ FIX: gabungkan semua sisa bagian

  if (isNaN(folder_id)) {
    throw new Error(`Nama folder tidak valid: ${folderName}`)
  }

  return { folder_id, cvat_label }
}

// Ambil gambar dari Cloudinary
async function getImages(folder) {
  const result = await cloudinary.search
    .expression(`folder:${folder}`)
    .max_results(100)
    .execute()

  return result.resources
}

// ======================
// 🚀 MAIN SEED FUNCTION
// ======================

async function seed() {
  try {
    validateEnv()

    const folders = []

    // generate sawit1 - sawit9
    for (let i = 1; i <= 9; i++) {
      folders.push(`sawit${i}_sawit_pruning`)
      folders.push(`sawit${i}_sawit_ragu`)
      folders.push(`sawit${i}_sawit_underpruning`)
    }

    // ✅ FIX: Ambil semua filename yang sudah ada di DB untuk skip duplikat
    const { data: existing, error: fetchError } = await supabase
      .from('images')
      .select('filename')

    if (fetchError) throw new Error(`Gagal cek existing data: ${fetchError.message}`)

    const existingFilenames = new Set(existing.map(e => e.filename))
    console.log(`ℹ️ Ada ${existingFilenames.size} gambar sudah di database`)

    let totalInserted = 0

    for (const folder of folders) {
      const { folder_id, cvat_label } = parseFolder(folder)

      console.log(`\n📂 Processing: ${folder} (folder_id=${folder_id}, label=${cvat_label})`)

      // ✅ FIX: Tangani error per folder, tidak langsung crash semua
      let images
      try {
        images = await getImages(folder)
      } catch (err) {
        console.error(`❌ Gagal fetch Cloudinary folder ${folder}:`, err.message)
        continue
      }

      console.log(`➡️ Found ${images.length} images`)

      if (images.length === 0) {
        console.log('⚠️ Skip (no images)')
        continue
      }

      // ✅ FIX: Filter gambar yang belum ada di database
      const newImages = images.filter(img => {
        const filename = img.public_id.split('/').pop()
        return !existingFilenames.has(filename)
      })

      if (newImages.length === 0) {
        console.log('⏭️ Skip (semua gambar sudah ada di database)')
        continue
      }

      console.log(`🆕 ${newImages.length} gambar baru akan diinsert`)

      const data = newImages.map(img => ({
        folder_id,
        filename: img.public_id.split('/').pop(),
        cvat_label,
        image_url: img.secure_url
      }))

      const { data: res, error } = await supabase
        .from('images')
        .insert(data)
        .select()

      if (error) {
        console.error(`❌ INSERT ERROR untuk folder ${folder}:`, error)
      } else {
        totalInserted += res.length
        console.log(`✅ Inserted ${res.length} rows`)

        // ✅ FIX: Update set agar pengecekan duplikat akurat untuk folder berikutnya
        res.forEach(r => existingFilenames.add(r.filename))
      }
    }

    console.log(`\n🎉 SEEDING DONE! Total inserted: ${totalInserted} rows`)
  } catch (err) {
    console.error('🔥 GLOBAL ERROR:', err.message)
    process.exit(1)
  }
}

// ======================
// ▶️ RUN
// ======================

console.log("URL:", process.env.SUPABASE_URL ? '✅ Set' : '❌ Missing')
console.log("KEY:", process.env.SUPABASE_KEY ? '✅ Set' : '❌ Missing')

seed()