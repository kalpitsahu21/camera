
    const video = document.getElementById("video");
    const canvas = document.getElementById("canvas");
    const ctx = canvas.getContext("2d");

    const startBtn = document.getElementById("startBtn");
    const saveBtn = document.getElementById("saveBtn");
    const statusEl = document.getElementById("status");

    const strengthSlider = document.getElementById("strengthSlider");
    const strengthVal = document.getElementById("strengthVal");

    const blendSlider = document.getElementById("blendSlider");
    const blendVal = document.getElementById("blendVal");

    const modeButtons = document.querySelectorAll(".btn-mode");

    let stream = null;
    let running = false;
    let currentMode = "sketch";

    // Update slider labels
    strengthSlider.addEventListener("input", () => {
      strengthVal.textContent = strengthSlider.value;
    });
    blendSlider.addEventListener("input", () => {
      blendVal.textContent = blendSlider.value;
    });

    // Mode switching
    modeButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        modeButtons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentMode = btn.getAttribute("data-mode");
        statusEl.textContent = `Mode: ${currentMode.charAt(0).toUpperCase() + currentMode.slice(1)}`;
      });
    });

    // Start camera
    startBtn.addEventListener("click", async () => {
      try {
        statusEl.textContent = "Requesting camera access...";
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        video.srcObject = stream;

        video.addEventListener("loadedmetadata", () => {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          running = true;
          statusEl.textContent = "Camera started. Filters are live.";
          drawLoop();
        }, { once: true });
      } catch (err) {
        console.error(err);
        statusEl.textContent = "Could not access camera. Use HTTPS or localhost and allow permissions.";
      }
    });

    // Save current frame as image
    saveBtn.addEventListener("click", () => {
      if (!canvas.width || !canvas.height) {
        statusEl.textContent = "Nothing to save yet. Start the camera first.";
        return;
      }

      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = "camera-drawing.png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      statusEl.textContent = "Image saved (downloaded as camera-drawing.png).";
    });

    // Main rendering loop
    function drawLoop() {
      if (!running) return;

      // Draw live video to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Grab pixels
      let frame = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const strength = parseFloat(strengthSlider.value);
      const blend = parseFloat(blendSlider.value);

      // Apply selected filter
      let filtered;
      if (currentMode === "sketch") {
        filtered = toSketch(frame, strength);
      } else if (currentMode === "cartoon") {
        filtered = toCartoon(frame, strength);
      } else {
        filtered = toCharcoal(frame, strength);
      }

      // Blend between original and effect
      const blended = blendImages(frame, filtered, blend);

      // Draw final output
      ctx.putImageData(blended, 0, 0);

      requestAnimationFrame(drawLoop);
    }

    // Blend original and effect by factor t (0 = original, 1 = fully effect)
    function blendImages(original, effect, t) {
      const src = original.data;
      const dst = effect.data;
      const out = new Uint8ClampedArray(src.length);
      const it = 1 - t;

      for (let i = 0; i < src.length; i += 4) {
        out[i]     = src[i] * it + dst[i] * t;
        out[i + 1] = src[i + 1] * it + dst[i + 1] * t;
        out[i + 2] = src[i + 2] * it + dst[i + 2] * t;
        out[i + 3] = 255;
      }

      return new ImageData(out, original.width, original.height);
    }

    // =============== FILTERS ===============

    // Pencil sketch using Sobel edges (grayscale)
    function toSketch(imageData, strength = 1.5) {
      const { width, height, data } = imageData;
      const numPixels = width * height;

      const gray = new Uint8ClampedArray(numPixels);

      // Grayscale
      for (let i = 0; i < numPixels; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      }

      const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
      const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

      const out = new Uint8ClampedArray(numPixels * 4);

      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          let gx = 0, gy = 0, k = 0;

          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const px = x + kx;
              const py = y + ky;
              const idx = py * width + px;
              const val = gray[idx];

              gx += sobelX[k] * val;
              gy += sobelY[k] * val;
              k++;
            }
          }

          const mag = Math.sqrt(gx * gx + gy * gy);
          const edge = 255 - Math.min(255, mag * strength * 1.1); // inverted for pencil lines

          const di = (y * width + x) * 4;
          out[di] = out[di + 1] = out[di + 2] = edge;
          out[di + 3] = 255;
        }
      }

      return new ImageData(out, width, height);
    }

    // Cartoon effect: posterize colors + black edges
    function toCartoon(imageData, strength = 1.5) {
      const { width, height, data } = imageData;
      const numPixels = width * height;

      const gray = new Uint8ClampedArray(numPixels);

      // Grayscale for edges
      for (let i = 0; i < numPixels; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      }

      const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
      const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

      const edges = new Float32Array(numPixels);

      // Edge magnitude
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          let gx = 0, gy = 0, k = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const px = x + kx;
              const py = y + ky;
              const idx = py * width + px;
              const val = gray[idx];
              gx += sobelX[k] * val;
              gy += sobelY[k] * val;
              k++;
            }
          }
          const mag = Math.sqrt(gx * gx + gy * gy);
          edges[y * width + x] = mag;
        }
      }

      const out = new Uint8ClampedArray(numPixels * 4);
      const levels = 6; // color quantization levels
      const step = 255 / (levels - 1);
      const edgeThreshold = 80; // base threshold

      function quantize(v) {
        return Math.round(v / step) * step;
      }

      for (let i = 0; i < numPixels; i++) {
        const idx4 = i * 4;
        const r = data[idx4];
        const g = data[idx4 + 1];
        const b = data[idx4 + 2];

        let qr = quantize(r);
        let qg = quantize(g);
        let qb = quantize(b);

        // mild smoothing look
        qr = Math.min(255, qr + 4);
        qg = Math.min(255, qg + 4);
        qb = Math.min(255, qb + 4);

        const e = edges[i] * strength;

        if (e > edgeThreshold) {
          // strong black outline
          out[idx4] = out[idx4 + 1] = out[idx4 + 2] = 0;
        } else {
          out[idx4] = qr;
          out[idx4 + 1] = qg;
          out[idx4 + 2] = qb;
        }
        out[idx4 + 3] = 255;
      }

      return new ImageData(out, width, height);
    }

    // Charcoal effect: harsh edges + noise on grayscale
    function toCharcoal(imageData, strength = 1.5) {
      const { width, height, data } = imageData;
      const numPixels = width * height;

      const gray = new Float32Array(numPixels);

      for (let i = 0; i < numPixels; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      }

      const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
      const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

      const out = new Uint8ClampedArray(numPixels * 4);

      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          let gx = 0, gy = 0, k = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const px = x + kx;
              const py = y + ky;
              const idx = py * width + px;
              const val = gray[idx];
              gx += sobelX[k] * val;
              gy += sobelY[k] * val;
              k++;
            }
          }
          const mag = Math.sqrt(gx * gx + gy * gy) * strength * 1.4;
          let v = 255 - Math.min(255, mag); // dark strokes

          // push towards darker charcoal look
          v = v * 0.8;

          // add subtle noise
          const noise = (Math.random() - 0.5) * 40;
          v = Math.max(0, Math.min(255, v + noise));

          const di = (y * width + x) * 4;
          out[di] = out[di + 1] = out[di + 2] = v;
          out[di + 3] = 255;
        }
      }

      return new ImageData(out, width, height);
    }
