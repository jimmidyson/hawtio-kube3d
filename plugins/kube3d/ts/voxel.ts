/// <reference path="kube3dPlugin.ts"/>
/// <reference path="podlek.ts"/>
/// <reference path="energyBolt.ts"/>
/// <reference path="player.ts"/>
/// <reference path="sounds.ts"/>

module Kube3d {

  var maxProjectiles = 20;
  var chunkSize = 32;

  // var generateChunk = perlinTerrain();
  var generateChunk = cityTerrain();

  // good for debugging
  // var generateChunk = flatTerrain();

  export var VoxelController = controller('VoxelController', ['$scope', '$element', 'KubernetesModel', 'localStorage', ($scope, $element, model:Kubernetes.KubernetesModelService, localStorage) => {

    $scope.locked = true;
    $scope.playerDeaths = 0;
    $scope.score = 0;

    var highScore = Core.parseIntValue(localStorage['kube3d.highScore']);
    
    $scope.highScore = highScore ? highScore : 0;

    var entities = {};

    var currentTrack:any = undefined;

    function projectileCount() {
      return _.filter(_.keys(entities), (key) => _.startsWith('projectile-', key)).length;
    }

    $scope.incrementScore = () => {
      if ($scope.player && $scope.player.isDead()) {
        return;
      }
      $scope.score = $scope.score + 1;
      Core.$apply($scope);
    }

    $scope.$watch('player.isDead()', (isDead) => {
      if (!isDead) {
        return;
      } 
      if ($scope.score > $scope.highScore) {
        $scope.highScore = $scope.score;
        localStorage['kube3d.highScore'] = $scope.highScore;
      }
    });

    $scope.resetScore = () => {
      $scope.score = 0;
      Core.$apply($scope);
    }

    var sky: any = undefined;

    var el = $element.find('.kube3d-control')[0];
    var game = createGame({
        lightsDisabled: true,
        fogDisabled: false,
        generateChunks: false,
        texturePath: 'resources/textures/',
        materials: [['grass', 'dirt', 'grass_dirt'], 'dirt', 'brick', 'Building1', 'Building2', 'Sidewalk', 'Window'],
        materialFlatColor: false,
        container: el
      }, (game, avatar) => {

        var target = game.controls.target();

        var player = $scope.player = new Player(game, avatar, target, $scope);
        entities[player.getName()] = player;

        sky = createSky({
          game: game,
          time: 800,
          speed: 0.1,
          color: new game.THREE.Color(game.skyColor)
        });

        // highlight blocks when you look at them, hold <Ctrl> for block placement
        /*
        var blockPosPlace, blockPosErase;
        var hl = game.highlighter = highlight(game, { color: 0xff0000 });
        hl.on('highlight', function (voxelPos) { blockPosErase = voxelPos });
        hl.on('remove', function (voxelPos) { blockPosErase = null });
        hl.on('highlight-adjacent', function (voxelPos) { blockPosPlace = voxelPos });
        hl.on('remove-adjacent', function (voxelPos) { blockPosPlace = null });
        */

        // toggle between first and third person modes
        window.addEventListener('keydown', function (ev) {
          if (ev.keyCode === 'R'.charCodeAt(0)) avatar.toggle();
        });

        // block interaction stuff, uses highlight data
        var currentMaterial = 1;

        game.on('fire', function (origin, state) {
          if (projectileCount() > maxProjectiles) {
            return;
          }
          var name = origin.getName ? origin.getName() : player.getName();
          var direction = origin.getName ? null : game.cameraVector();
          if (!direction) {
            var z = Math.cos(origin.rotation.y);
            var x = Math.sin(origin.rotation.y);
            var y = game.THREE.Math.degToRad(10);
            direction = [x, y, z];
          }
          var bolt = new EnergyBolt(game, origin, direction, name);
          entities[bolt.getName()] = bolt;
          if (!origin.getName) {
            playerLaser.play();
          } else {
            playSound(podlekLaser, target, origin);
          }
        });

        game.on('tick', function(delta) {
          if ($scope.locked && !game.paused) {
            log.debug("Game: ", game);
            $scope.locked = false;
            Core.$apply($scope);
          }

          if (settings.music) {
            if (currentTrack !== undefined && player.isDead()) {
              currentTrack.stop();
              currentTrack = undefined;
            }
            if (currentTrack === undefined && !player.isDead()) {
              currentTrack = tracks[_.random(tracks.length - 1)];
              currentTrack.on('end', () => {
                currentTrack = undefined;
              });
              currentTrack.play();
            }
          }

          sky()(delta);

          /*
          if (game.pendingChunks.length) {
            log.debug("Pending chunks, skipping entity creation");
            return;
          }
          */

          _.forIn(model.podsByKey, (pod, key) => {
            var creature:any = entities[key];
            if (!creature) {
              creature = entities[key] = new Podlek(model, game, key, pod, $scope);
            }
          });

          // entities
          var entitiesToRemove = [];
          _.forIn(entities, (entity, key) => {
            if (entity.needsSpawning()) {
              log.debug("need to create entity ", key);
              entity.spawn(target);
            } else {

              if (entity.shouldDie()) {
                entity.die(false);
              }

              entity.tick(delta);
              entity.checkCollisions(entities);

              if (entity.isDestroyed()) {
                entitiesToRemove.push(entity.getName());
              }
            }
          });
          _.forEach(entitiesToRemove, (key) => {
            var creature = entities[key];
            if (!creature) {
              return;
            }
            delete entities[key];
          });
        });
      });

    // generate terrain on-demand
    game.voxels.on('missingChunk', (p) => {
      var voxels = generateChunk(p, chunkSize);
      var chunk = {
        position: p,
        dims: [chunkSize, chunkSize, chunkSize],
        voxels: voxels
      };
      game.showChunk(chunk);
    });

    function cleanup() {
      if (game) {
        game.destroy();
        delete game;
      }
      if (sky) {
        delete sky;
      }
      if (currentTrack) {
        currentTrack.stop();
      }
    }

    // just to be on the safe side :-)
    $element.on('$destroy', cleanup);
    $scope.$on('$destroy', cleanup);

    function updatePods(e, model) {
      log.debug("model updated: ", model);
      _.forIn(model.podsByKey, (pod, key) => {
        var creature:any = entities[key];
        if (!creature) {
          creature = entities[key] = new Podlek(model, game, key, pod, $scope);
        } else {
          creature.pod = pod;
        }
      });
      log.debug("Creatures:", entities);
    }
    $scope.$on('kubernetesModelUpdated', updatePods);
  }]);
  
}
