package com.bourbonsignal.labels

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.net.Uri
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.android.gms.tasks.Tasks
import java.io.File
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ShelfPhotoTest {
  @Test fun readsExpressionVolumeAndPriceFromOneImage() {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    val tag = File.createTempFile("shelf-tag-", ".jpg", context.cacheDir)
    val bitmap = Bitmap.createBitmap(1080, 640, Bitmap.Config.ARGB_8888)
    try {
      val canvas = Canvas(bitmap)
      canvas.drawColor(Color.WHITE)
      val ink = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK; textSize = 72f }
      canvas.drawText("Weller Antique 107", 48f, 160f, ink)
      canvas.drawText("750 mL", 48f, 320f, ink)
      canvas.drawText("$49.99", 48f, 470f, ink)
      tag.outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, 95, it) }
      val text = Tasks.await(readShelfPhoto(context, Uri.fromFile(tag)), 30, TimeUnit.SECONDS)
      assertTrue(text, text.contains("Antique 107") && text.contains("750") && text.contains("49.99"))
    } finally {
      bitmap.recycle()
      tag.delete()
    }
  }
}
