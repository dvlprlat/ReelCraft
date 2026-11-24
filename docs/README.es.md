# ReelCraft (Guía en Español)

[![Tests](https://github.com/dvlprlat/ReelCraft/actions/workflows/test.yml/badge.svg)](https://github.com/dvlprlat/ReelCraft/actions/workflows/test.yml)

**Pipeline open-source listo para agentes de IA que convierte videos crudos o audios en voz en off en Reels, TikToks y YouTube Shorts profesionales usando lenguaje natural.**

Funciona con **Claude Code, Claude Cowork, Antigravity, Codex y OpenCode**, con un solo motor (**HyperFrames**) que cubre tanto videos **con persona a cámara (*Talking-Head*)** como **sin persona (*Faceless*)**.

---

## Cómo usarlo sin conocimientos técnicos

No necesitas memorizar comandos. Solo dile a tu agente:

> *"Descarga ReelCraft, revisa si mi equipo cumple los requisitos y ayúdame a editar mi video."*

### Paso 1: Coloca tus archivos en `input/<nombre-proyecto>/`
- **Si sales a cámara:** guarda tu video crudo como `raw.mp4` o `raw.mov`.
- **Si es un video sin persona (*Faceless*):** guarda tu voz en off como `voice.wav` o `voice.mp3`.
- **Opcionales que mejoran el resultado:**
  - `script.md`: tu guion escrito (si lo tienes, ayuda a quitar tomas falsas al instante).
  - `media/`: fotos, capturas de pantalla, logos o clips extra que quieras mostrar.
  - `music.mp3`: música de fondo (se nivela automáticamente por debajo de tu voz).
  - `brand.json`: colores, usuario o tipografía preferida.

### Paso 2: Pídele al agente lo que quieres en lenguaje natural
Ejemplos reales:
- *"Procesa `mi-video` tomando de referencia el estilo de este TikTok: `https://...`"*
- *"Haz los subtítulos un poco más grandes, cambia el color de acento a verde menta y quita la pausa del segundo 18."*
- *"Revisa el audio por si quedó alguna palabra repetida y vuelve a renderizar."*

*(También puedes usar atajos tipo skill: `/reelcraft setup`, `/reelcraft process <proyecto>`, `/reelcraft edit "..."`, `/reelcraft review <proyecto>`, `/reelcraft style <url>` y `/reelcraft render <proyecto>`).*

---

## ¿Tu computadora no cumple los requisitos mínimos? (Nube gratuita)

Corre `npm run doctor` (o pídele a tu agente que lo haga). Si tu equipo tiene poca RAM (`< 8 GB`) o no tiene GPU:
1. **Transcripción en la nube gratis (recomendado):** Crea una clave gratuita en [console.groq.com](https://console.groq.com), ponla como `GROQ_API_KEY` en `.env` y el agente transcribirá en ~2 segundos con 0 consumo de RAM local.
2. **Todo en la nube gratis con GPU T4:** Abre `cloud/reelcraft_colab.ipynb` en Google Colab.
3. **Sin instalar nada local:** Abre el repo en **GitHub Codespaces** (usa `.devcontainer/devcontainer.json` con horas gratuitas al mes).

Consulta los pasos detallados en [CLOUD_SETUP.md](CLOUD_SETUP.md).
