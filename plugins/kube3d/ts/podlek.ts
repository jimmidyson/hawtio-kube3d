/// <reference path="kube3dHelpers.ts"/>

module Kube3d {

  var deathFrames = 1 * 60;
  var maxHealth = 1;
  var laserCooldownTime = 1 * 60;

  export class Podlek {
    private playerHit = false;
    private dead = false;
    private dying = false;
    private deleteCalled = false;
    private _entity:any = undefined;
    private _clearInterval:() => void = undefined;
    private log:Logging.Logger = undefined;
    private health = maxHealth;
    private deathFrameCount = 0;

    private box:any = undefined;
    private cloud:any = undefined;

    private position:any = undefined;
    private rotation:any = undefined;

    private desiredAngle:any = 0;
    private turning = false;
    private noticed = false;
    private cooldown = 0;

    public constructor(private model, private game, private _name:string, private _pod:any) {
      this.log = Logger.get('podlek-' + _name);
    }

    public getName() {
      return this._name;
    }

    private createMesh() {
      var game = this.game;
      var THREE = game.THREE;
      var height = game.cubeSize;
      var width = game.cubeSize;
      var depth = game.cubeSize;
      var heightOffset = height / 2;
      var answer = new THREE.Object3D();
      var boxTexture = THREE.ImageUtils.loadTexture(this._pod.$iconUrl);
      boxTexture.minFilter = THREE.NearestFilter;
      // commenting these now so I remember which element = which axis
      var materials = [
        new THREE.MeshLambertMaterial({ color: 0xffffff }), // + x-axis
        new THREE.MeshLambertMaterial({ color: 0xffffff }), // - x-axis
        new THREE.MeshLambertMaterial({ color: 0xffffff }), // + y-axis
        new THREE.MeshLambertMaterial({ color: 0xffffff }), // - y-axis
        new THREE.MeshLambertMaterial({ map: boxTexture }), // + z-axis
        new THREE.MeshLambertMaterial({ color: 0xffffff })  // - z-axis
      ];
      var boxMaterial = new THREE.MeshFaceMaterial(materials);
      var box = this.box = new THREE.Mesh(new THREE.CubeGeometry(height, width, depth), boxMaterial);
      var cloud = this.cloud = getParticles(THREE, game.cubeSize, 0xffffff, 1000);
      box.visible = true;
      cloud.visible = false;
      box.position.y = heightOffset;
      cloud.position.y = heightOffset;
      answer.add(box);
      answer.add(cloud);
      // debugging
      /*
      var axis = new THREE.AxisHelper(5);
      axis.position.y = heightOffset;
      answer.add(axis);
      */
      //
      return answer;
    }

    public destroy() {
      this.dead = true;
      if (this.entity) {
        this.game.removeItem(this.entity);
      }
      if (this.clearInterval) {
        this.clearInterval();
      }
    }

    public checkCollisions(entities) {
      // TODO
    }

    public lookAt(obj) {
      var a = obj.position || obj;
      var b = this.position;
      this.desiredAngle = Math.atan2(a.x - b.x, a.z - b.z) + Math.random() * 1/4 - 1/8;
    }

    public notice(target, radius) {
      var t = target.position || target;
      return this.game.setInterval(() => {
        var dist = this.position.distanceTo(t);
        if (dist < radius) {
          this.lookAt(t);
          this.noticed = true;
        } else {
          this.noticed = false;
        }
      }, 1000);
    }

    public jump(amount = 0.017) {
      if (this._entity.velocity.y !== 0) {
        return;
      }
      // this.log.debug("Jumping!");
      this.entity.velocity.y = amount;
    }

    public forward(amount = 0.025) {
      if (this._entity.velocity.y !== 0) {
        return;
      }
      this.entity.velocity.z = amount;

      var angle = this.rotation.y;
      var pt = this.position.clone();
      pt.y = this.position.y;
      pt.x += this.game.cubeSize / 2 * Math.sin(angle);
      pt.z += this.game.cubeSize / 2 * Math.cos(angle);
      var block = this.game.getBlock(pt);
      if (block !== false) {
        this.game.setTimeout(() => { 
          this.jump();
          this.game.setTimeout(() => {
            this.entity.velocity.z = 0.017;
          }, 100);
        }, 500);
      }
    }

    public tick(delta) {
      if (this.dead || !this._entity) {
        return;
      }
      if (this.health <= 0 && !this.dying) {
        this.die();
      }
      if (this.dying) {
        this.entity.velocity.x = 0;
        this.entity.velocity.y = 0;
        this.entity.velocity.z = 0;
        this.cloud.scale.x = this.cloud.scale.x + 0.2;
        this.cloud.scale.y = this.cloud.scale.y + 0.2;
        this.cloud.scale.z = this.cloud.scale.z + 0.2;
        this.deathFrameCount = this.deathFrameCount + 1;
        if (this.deathFrameCount > deathFrames) {
          this.destroy();
        }
      } else {
        var angle = this.desiredAngle.toPrecision(2);
        if (this.turning && this.rotation.y < angle) {
          this.rotation.y += 0.01;
        } else if (this.turning && this.rotation.y > angle) {
          this.rotation.y -= 0.01;
        } else {
          this.turning = false;
        }
        if (this.noticed && this.cooldown < 0 && maybe()) {
          this.game.emit('fire', this);
          this.cooldown = laserCooldownTime;
        } else if (this.noticed) {
          this.cooldown--;
        }
        if (this.entity.mesh.position.y < -5) {
          this.log.debug("I fell off the world!  dying...");
          this.die(false);
        }
      }
    }

    public shouldDie() {
      return (!(this._name in this.model.podsByKey));
    }

    public isDestroyed() {
      return this.dead;
    }

    public isDying() {
      return this.dying || this.dead;
    }

    public hit() {
      this.playerHit = true;
      this.health = this.health - 1;
      this.log.debug("I got hit!, health: ", this.health);
    }

    public die(playerHit = this.playerHit) {
      if (this.dying) {
        return;
      }
      this.log.debug("I'm dying!");
      this.dying = true;
      if (this.playerHit && !this.deleteCalled) {
        this.log.debug("Deleting resource");
        this.model['podsResource'].delete({ id: Kubernetes.getName(this.pod) });
        this.deleteCalled = true;
      }
      if (this.clearInterval) {
        this.clearInterval();
        delete this.clearInterval;
      }
      if (this.box) {
        this.box.visible = false;
      }
      if (this.cloud) {
        this.cloud.visible = true;
      }
    }

    public spawn(player) {
      var game = this.game;
      var playerX = player.position.x;
      var playerZ = player.position.z;
      var distX = Math.random() * 30 + 10;
      var distZ = Math.random() * 30 + 10;
      distX = maybe() ? distX : distX * -1;
      distZ = maybe() ? distZ : distZ * -1;
      var x = Math.round(playerX + distX);
      var z = Math.round(playerZ + distZ);
      // find the right height to spawn at;
      var y = getY(game, x, z);
      if (y === null) {
        log.debug("Not spawning, world isn't ready yet");
        return;
      }
      var mesh = this.createMesh();
      mesh.name = this._name;
      this.log.debug("Spawning at x:", x, " y: ", y, " z:", z, " player at x:", playerX, " z:", playerZ);
      //mesh.position.set(x, 30, z);
      var item:any = {
        mesh: mesh,
        size: this.game.cubeSize,
        velocity: { x: 0, y: 0, z: 0 }
      };
      this.entity = game.addItem(item);
      this.position = this.entity.yaw.position;
      this.rotation = this.entity.yaw.rotation;
      this.position.set(x, y, z);

      var walkAround = () => {
        if (this.dying || this.dead || !this.entity) {
          return;
        }
        if (!this.noticed && maybe()) {
          this.desiredAngle += Math.random() * HalfPI - QuarterPI;
          this.turning = true;
        }
        this.forward();
        this.clearInterval = this.game.setTimeout(walkAround, Math.random() * 1000 + 500);
      }
      this.notice(player, 20);
      walkAround();
    }

    public needsSpawning() {
      return !angular.isDefined(this._entity);
    }

    public get name() {
      return this._name;
    }

    public get pod() {
      return this._pod;
    }

    public set pod(p:any) {
      try {
        angular.copy(p, this._pod);
      } catch (e) {
        // most likely an identical object
      }
    }

    public get clearInterval() {
      return this._clearInterval;
    }

    public set clearInterval(f:() => void) {
      this._clearInterval = f;
    }

    public get entity() {
      return this._entity;
    }

    public set entity(e:any) {
      this._entity = e;
    }

  }

}
