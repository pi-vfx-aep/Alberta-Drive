import './styles.css'
import * as THREE from 'three'

const maybeCanvas = document.querySelector<HTMLCanvasElement>('#game')
if (!maybeCanvas) throw new Error('Missing #game canvas element in index.html')
const canvas: HTMLCanvasElement = maybeCanvas

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x9ec6e8)

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 300)
camera.position.set(0, 7, 14)
camera.lookAt(0, 0, 0)

// Road: flat plane
const road = new THREE.Mesh(
  new THREE.PlaneGeometry(9, 120),
  new THREE.MeshStandardMaterial({ color: 0x33363d }),
)
road.rotation.x = -Math.PI / 2
scene.add(road)

// Car: simple box
const car = new THREE.Mesh(
  new THREE.BoxGeometry(2, 1, 4),
  new THREE.MeshStandardMaterial({ color: 0xd94f3d }),
)
car.position.set(0, 0.5, 0)
scene.add(car)

// Lights
const ambient = new THREE.AmbientLight(0xffffff, 0.7)
scene.add(ambient)
const sun = new THREE.DirectionalLight(0xffffff, 1.3)
sun.position.set(6, 12, 8)
scene.add(sun)

function resize(): void {
  const parent = canvas.parentElement
  const width = parent?.clientWidth ?? window.innerWidth
  const height = parent?.clientHeight ?? window.innerHeight

  renderer.setSize(width, height, false)
  camera.aspect = width / Math.max(height, 1)
  camera.updateProjectionMatrix()
}

window.addEventListener('resize', resize)
resize()

renderer.setAnimationLoop(() => renderer.render(scene, camera))
