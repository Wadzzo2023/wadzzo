/* eslint-disable */
/**
 * IMPORTANT - this code is a modified version the former official three.js
 * DeviceOrientationControls class, which was formerly provided with the
 * three.js repo
 *
 * Changes:
 *
 * - use "deviceorientationabsolute" rather than "deviceorientation"
 *   where available
 * - automatically request permissions on instantiation
 * - improved permission handling for iOS 13+
 */

/**
 * @author richt / http://richt.me
 * @author WestLangley / http://github.com/WestLangley
 *
 * W3C Device Orientation control (http://w3c.github.io/deviceorientation/spec-source-orientation.html)
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck

import * as THREE from "three"

const _zee = new THREE.Vector3(0, 0, 1)
const _euler = new THREE.Euler()
const _q0 = new THREE.Quaternion()
const _q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)) // - PI/2 around the x-axis

const _changeEvent = { type: "change" }

class DeviceOrientationControls extends THREE.EventDispatcher {
  constructor(object) {
    super()

    if (window.isSecureContext === false) {
      console.error(
        "THREE.DeviceOrientationControls: DeviceOrientationEvent is only available in secure contexts (https)",
      )
    }
    

    const EPS = 0.000001
    const lastQuaternion = new THREE.Quaternion()

    this.object = object
    this.object.rotation.reorder("YXZ")

    this.enabled = true
    this.permissionsGranted = false

    this.deviceOrientation = {}
    this.screenOrientation = 0

    this.alphaOffset = 0 // radians

    this.deviceOrientationEventName =
      "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation"

    const onDeviceOrientationChangeEvent = (event) => {
      this.deviceOrientation = event
    }

    const onScreenOrientationChangeEvent = () => {
      this.screenOrientation = window.orientation || 0
    }

    // The angles alpha, beta and gamma form a set of intrinsic Tait-Bryan angles of type Z-X'-Y''
    const setObjectQuaternion = (quaternion, alpha, beta, gamma, orient) => {
      _euler.set(beta, alpha, -gamma, "YXZ") // 'ZXY' for the device, but 'YXZ' for us

      quaternion.setFromEuler(_euler) // orient the device

      quaternion.multiply(_q1) // camera looks out the back of the device, not the top

      quaternion.multiply(_q0.setFromAxisAngle(_zee, -orient)) // adjust for screen orientation
    }

    // Auto-request permissions when instance is created
    this.requestPermissions = async () => {
      try {
        // Request device orientation permission for iOS 13+
        if (
          window.DeviceOrientationEvent !== undefined &&
          typeof window.DeviceOrientationEvent.requestPermission === "function"
        ) {
          console.log("Requesting DeviceOrientationEvent permission...")
          const orientationResponse = await window.DeviceOrientationEvent.requestPermission()

          if (orientationResponse !== "granted") {
            console.warn("DeviceOrientationEvent permission denied")
            return false
          }

          console.log("DeviceOrientationEvent permission granted")
        }

        // Request device motion permission for iOS 13+ (optional)
        if (
          window.DeviceMotionEvent !== undefined &&
          typeof window.DeviceMotionEvent.requestPermission === "function"
        ) {
          console.log("Requesting DeviceMotionEvent permission...")
          try {
            const motionResponse = await window.DeviceMotionEvent.requestPermission()
            if (motionResponse !== "granted") {
              console.warn("DeviceMotionEvent permission denied, but continuing...")
            } else {
              console.log("DeviceMotionEvent permission granted")
            }
          } catch (error) {
            console.warn("DeviceMotionEvent permission request failed:", error)
          }
        }

        this.permissionsGranted = true
        return true
      } catch (error) {
        console.error("Permission request failed:", error)
        return false
      }
    }

    this.connect = () => {
      onScreenOrientationChangeEvent() // run once on load

      // Add event listeners
      window.addEventListener("orientationchange", onScreenOrientationChangeEvent)
      window.addEventListener(this.deviceOrientationEventName, onDeviceOrientationChangeEvent)

      this.enabled = true
      console.log("DeviceOrientationControls connected")
    }

    this.disconnect = () => {
      window.removeEventListener("orientationchange", onScreenOrientationChangeEvent)
      window.removeEventListener(this.deviceOrientationEventName, onDeviceOrientationChangeEvent)

      this.enabled = false
    }

    this.update = () => {
      if (this.enabled === false) return

      const device = this.deviceOrientation

      if (device) {
        const alpha = device.alpha ? THREE.MathUtils.degToRad(device.alpha) + this.alphaOffset : 0 // Z

        const beta = device.beta ? THREE.MathUtils.degToRad(device.beta) : 0 // X'

        const gamma = device.gamma ? THREE.MathUtils.degToRad(device.gamma) : 0 // Y''

        const orient = this.screenOrientation ? THREE.MathUtils.degToRad(this.screenOrientation) : 0 // O

        setObjectQuaternion(this.object.quaternion, alpha, beta, gamma, orient)

        if (8 * (1 - lastQuaternion.dot(this.object.quaternion)) > EPS) {
          lastQuaternion.copy(this.object.quaternion)
          this.dispatchEvent(_changeEvent)
        }
      }
    }

    this.dispose = () => {
      this.disconnect()
    }

    // Automatically request permissions and connect when instance is created
    this.init = async function () {
      const permissionsGranted = await this.requestPermissions()
      if (permissionsGranted || !this.requiresPermission()) {
        this.connect()
        return true
      }
      return false
    }

    // Check if device requires permission (iOS 13+)
    this.requiresPermission = () =>
      window.DeviceOrientationEvent !== undefined &&
      typeof window.DeviceOrientationEvent.requestPermission === "function"

    // Auto-initialize if no permission required, otherwise wait for manual init
    if (!this.requiresPermission()) {
      this.connect()
      this.permissionsGranted = true
    }
  }
}

export { DeviceOrientationControls }
