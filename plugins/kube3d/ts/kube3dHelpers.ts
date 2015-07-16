/// <reference path="../../includes.ts"/>
/// <reference path="kube3dInterfaces.ts"/>

module Kube3d {
  export var pluginName = 'Kube3d';
  export var log:Logging.Logger = Logger.get(pluginName);
  export var templatePath = 'plugins/kube3d/html';
  export var havePointerLock = 'pointerLockElement' in document || 'mozPointerLockElement' in document || 'webkitPointerLockElement' in document;


  export var HalfPI = Math.PI / 2;

  export function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  export function randomGrey() {
    var rgbVal = Math.random() * 128 + 128;
    return rgbToHex(rgbVal, rgbVal, rgbVal);
  }

  export function webglAvailable() {
    try {
      var canvas = document.createElement( 'canvas' );
      return !!( (<any>window).WebGLRenderingContext && (
            canvas.getContext( 'webgl' ) ||
            canvas.getContext( 'experimental-webgl' ) )
          );
    } catch ( e ) {
      return false;
    }
  }



}
