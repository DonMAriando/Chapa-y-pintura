# Chapa y Polvo — Destruction Derby 3D

Juego de **Destruction Derby en 3D** para **1 jugador, 2 jugadores en pantalla dividida local y multijugador online por salas**. Ambientado en un predio nocturno de tierra iluminado por reflectores, los autos se embisten a toda velocidad usando nitro y rampas mientras sufren deformación física real, pérdida progresiva de piezas, humo y fuego hasta quedar hechos polvo.

---

## Resumen del juego

- **Formato de combate**: *Último auto en pie* (*Last Car Standing*). Gana el último piloto cuyo vehículo siga operativo en el predio.
- **Escenario**: Arena circular de tierra (`56 m` de radio) con peralte perimetral, barreras de neumáticos apilados, tribunas, 4 torres de reflectores, 4 pilares de hormigón, 4 rampas de salto y 4 plataformas de recarga de nitro.
- **Cero dependencias de assets externos**: Toda la geometría 3D, las texturas (tierra, pintura de carrocería, sombras, partículas) y el audio (efectos metálicos y música Heavy Metal) se generan de forma 100% procedural en tiempo real.

---

## Dinámica y mecánicas

### 1. Sistema de choques: atacante vs. golpeado
La lógica de colisiones premia la iniciativa agresiva al embestir:
- **Embestida frontal**: Si chocás de frente contra el lateral, la parte trasera o un costado de otro auto, **vos infligís el daño y no recibís daño propio (`0`)**.
- **Golpe lateral o trasero (*T-Bone*)**: Impactar el flanco o la cola del rival aplica un multiplicador de daño (`1.24x`) y genera torque de giro para desestabilizarlo.
- **Multiplicador de Nitro**: Embestir mientras el nitro está activo multiplica el daño infligido (`1.6x`).
- **Choque frontal mutuo**: Si dos autos se impactan nariz contra nariz, gana el choque quien combine mayor velocidad de aproximación, mejor alineación frontal y uso de nitro.
- **Muros y pilares**: Impactar el muro perimetral o los pilares de hormigón a alta velocidad también ocasiona daño leve al propio chasis.

### 2. Destrucción progresiva (sin *one-shots*)
El daño está balanceado para que los combates requieran múltiples impactos estratégicos:
- **Tope por impacto**: Ningún golpe individual puede quitar más de **42%** de integridad, evitando eliminaciones instantáneas de un solo toque.
- **Enfriamiento entre golpes**: Existe una ventana breve de `0.22s` tras recibir daño para evitar múltiples registros en un mismo roce.
- **Deformación de carrocería en tiempo real**: Los vértices del chasis y la cabina se abollan en el punto exacto y dirección del impacto.
- **Desprendimiento escalonado de piezas**: Según la zona golpeada y el porcentaje de chapa restante, hasta 7 piezas salen volando en 3D con física propia:
  - Paragolpes delantero (`<= 84%` o daño frontal)
  - Paragolpes trasero (`<= 76%` o daño trasero)
  - Alerón (`<= 68%` o daño trasero)
  - Puerta izquierda (`<= 56%` o daño lateral)
  - Puerta derecha (`<= 46%` o daño lateral)
  - Capó con toma de aire (`<= 34%` o daño frontal fuerte)
  - Baúl (`<= 22%` o daño trasero fuerte)
- **Deterioro visual y mecánico**:
  - Con menos de `58%` de chapa comienza a salir humo denso del motor y la velocidad máxima cae progresivamente.
  - Con menos de `45%` de chapa se tuerce la alineación (cámber) de las ruedas.
  - Con menos de `24%` el motor entra en llamas.
  - Al llegar a `0%` (**HECHO POLVO**), se desprenden todas las piezas restantes, el vehículo explota en chispas y fuego, y queda como chatarra humeante en el predio.

### 3. Conducción, Nitro, Rampas y Derrape
- **Freno de mano y derrape**: Reduce el agarre lateral sobre la tierra para girar rápido y encarar rivales, levantando nubes de polvo y dejando marcas de neumáticos en el suelo.
- **Nitro**: Se regenera lentamente con el tiempo y puede recargarse al instante (`+50%`) pasando sobre cualquiera de las 4 plataformas luminosas cian de la arena (cada plataforma tiene `7s` de recarga).
- **Rampas y choques aéreos**: Las 4 rampas lanzan los vehículos por el aire según su velocidad, permitiendo esquivar embestidas por arriba o chocar en pleno vuelo.
- **Cámara de persecución cercana**: Mantiene el foco cerca del auto para resaltar el tamaño y el peso de la chapa, con apertura dinámica de campo de visión al activar el nitro, *hitstop* y sacudida en golpes fuertes. Si tu auto queda destruido mientras la partida sigue, la cámara pasa automáticamente a seguir a un sobreviviente.

### 4. Audio metálico y banda sonora Heavy Metal
- **Efectos metálicos**: Los impactos combinan síntesis FM inarmónica, ruido metálico filtrado y crujidos de chapa/chatarra proporcionales a la fuerza del golpe, además de sonidos al desprenderse piezas, explosiones al destruir un auto, motores, turbo y derrape.
- **Banda sonora Heavy Metal (148 BPM)**: Secuenciador procedural con guitarra rítmica con distorsión valvular (*power chords* y galopes *palm-muted*), guitarra líder con *delay* en el estribillo, bajo y batería con doble bombo. Cambia de modo ambiental en el menú a intensidad completa durante el combate.
- Tanto la **música** como los **efectos de sonido** tienen botones independientes para activarlos o silenciarlos desde el menú, el HUD y la pausa.

---

## Modos de juego

1. **1 Jugador**: Enfrentamiento libre contra `3`, `5` o `7` rivales controlados por IA.
2. **2 Jugadores (Pantalla dividida local)**: Dos jugadores en el mismo teclado (pantalla dividida vertical izquierda/derecha) más `0` (duelo 1v1 puro), `2`, `4` o `6` bots IA.
3. **Multijugador (Salas online en tiempo real)**:
   - Configurá tu **nombre de piloto** y **color de carrocería**.
   - **Crear sala**: Elegí un nombre para la sala y la capacidad total de autos (`4`, `6` u `8` puestos). Se genera un código corto de 4 caracteres para compartir.
   - **Unirse a una sala**: Entrá desde la lista en vivo de salas abiertas o ingresando el código de 4 caracteres.
   - **Ocupación de puestos**: Cada persona que entra ocupa un puesto libre en la grilla y puede cambiarse de puesto haciendo clic en cualquier espacio disponible o modificar su color en tiempo real.
   - **Autocompletado con bots IA**: Cuando el anfitrión presiona **Comenzar**, todos los puestos que quedaron vacíos pasan a ser autos controlados por **IA (bots)** dentro del servidor autoritativo.
   - **Continuidad y revancha**: Si un jugador abandona en medio del combate, un bot toma el control de su auto; si el anfitrión sale de la sala, el rol pasa automáticamente al siguiente jugador. Al terminar la partida, el anfitrión puede devolver a toda la sala al lobby para jugar otra ronda.

---

## Controles

| Acción | 1 Jugador / Online | Jugador 1 (2P Local) | Jugador 2 (2P Local) |
| :--- | :--- | :--- | :--- |
| **Acelerar / Freno / Reversa** | `W` / `S` o `↑` / `↓` | `W` / `S` | `↑` / `↓` |
| **Doblar** | `A` / `D` o `←` / `→` | `A` / `D` | `←` / `→` |
| **Nitro** | `Shift` o `E` o `Enter` | `Shift Izq.` o `E` | `Enter`, `Numpad 0`, `/` o `.` |
| **Freno de mano (Derrape)** | `Espacio` | `Espacio` | `Ctrl Der.` o `Shift Der.` |
| **Pausa / Opciones** | `Esc` | `Esc` | `Esc` |

---

## Arquitectura técnica

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Three.js (`WebGLRenderer`, `RoomEnvironment`, `InstancedMesh` para partículas/escombros y deformación de mallas), Lucide React, Web Audio API.
- **Backend y Multijugador**: Express + `ws` (`WebSocketServer` en `/ws`) ejecutando la simulación física autoritativa del servidor a `30 Hz` (`src/game/serverSim.ts` y `src/game/arenaMath.ts`) compartida con la lógica del cliente.

---

## Cómo ejecutarlo localmente

### Requisitos previos
- **Node.js** `v20.19+` (rama 20) o `v22.12+` (recomendado `v22.12+`)
- **npm** (incluido con Node.js)

### Pasos para correr el proyecto

1. **Clonar el repositorio e ingresar al directorio:**
   ```bash
   git clone <URL_DEL_REPOSITORIO>
   cd <NOMBRE_DEL_DIRECTORIO>
   ```

2. **Instalar las dependencias:**
   ```bash
   npm install
   ```

3. **Variables de entorno (opcional):**
   El juego funciona localmente sin necesidad de claves externas. Si querés personalizar el puerto (por defecto `3000`), podés crear un archivo `.env` tomando como base `.env.example`:
   ```bash
   cp .env.example .env
   ```

4. **Iniciar el servidor de desarrollo (Frontend + Backend WebSocket):**
   ```bash
   npm run dev
   ```
   Esto levanta Express, el middleware de Vite y el servidor WebSocket `/ws` en un único puerto. Abrí tu navegador en:
   ```
   http://localhost:3000
   ```

### Probar el multijugador en tu computadora o red local
- **En la misma PC**: Abrí `http://localhost:3000` en dos pestañas o ventanas del navegador, entrá a la pestaña **Multijugador** en ambas, creá una sala en una y unite desde la otra (por lista o con el código de 4 letras).
- **Con otras personas en tu red local (LAN)**: Conectate desde otros dispositivos ingresando `http://<TU_IP_LOCAL>:3000`.

### Otros comandos útiles

- **Verificar tipos TypeScript:**
  ```bash
  npm run lint
  ```

- **Compilar para producción:**
  ```bash
  npm run build
  ```

- **Ejecutar el build de producción localmente:**
  ```bash
  NODE_ENV=production npx tsx server.ts
  ```
