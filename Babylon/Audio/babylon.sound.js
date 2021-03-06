﻿var BABYLON;
(function (BABYLON) {
    var Sound = (function () {
        /**
        * Create a sound and attach it to a scene
        * @param name Name of your sound
        * @param urlOrArrayBuffer Url to the sound to load async or ArrayBuffer
        * @param readyToPlayCallback Provide a callback function if you'd like to load your code once the sound is ready to be played
        * @param options Objects to provide with the current available options: autoplay, loop, volume, spatialSound, maxDistance, rolloffFactor, refDistance, distanceModel, panningModel
        */
        function Sound(name, urlOrArrayBuffer, scene, readyToPlayCallback, options) {
            var _this = this;
            this.autoplay = false;
            this.loop = false;
            this.useCustomAttenuation = false;
            this.spatialSound = false;
            this.refDistance = 1;
            this.rolloffFactor = 1;
            this.maxDistance = 100;
            this.distanceModel = "linear";
            this.panningModel = "HRTF";
            this.startTime = 0;
            this.startOffset = 0;
            this._position = BABYLON.Vector3.Zero();
            this._localDirection = new BABYLON.Vector3(1, 0, 0);
            this._volume = 1;
            this._isLoaded = false;
            this._isReadyToPlay = false;
            this._isPlaying = false;
            this._isDirectional = false;
            // Used if you'd like to create a directional sound.
            // If not set, the sound will be omnidirectional
            this._coneInnerAngle = 360;
            this._coneOuterAngle = 360;
            this._coneOuterGain = 0;
            this._name = name;
            this._scene = scene;
            this._audioEngine = this._scene.getEngine().getAudioEngine();
            this._readyToPlayCallback = readyToPlayCallback;

            // Default custom attenuation function is a linear attenuation
            this._customAttenuationFunction = function (currentVolume, currentDistance, maxDistance, refDistance, rolloffFactor) {
                if (currentDistance < maxDistance) {
                    return currentVolume * (1 - currentDistance / maxDistance);
                } else {
                    return 0;
                }
            };
            if (options) {
                this.autoplay = options.autoplay || false;
                this.loop = options.loop || false;
                this._volume = options.volume || 1;
                this.spatialSound = options.spatialSound || false;
                this.maxDistance = options.maxDistance || 100;
                this.useCustomAttenuation = options.useCustomAttenation || false;
                this.rolloffFactor = options.rolloffFactor || 1;
                this.refDistance = options.refDistance || 1;
                this.distanceModel = options.distanceModel || "linear";
                this.panningModel = options.panningModel || "HRTF";
            }

            if (this._audioEngine.canUseWebAudio) {
                this._soundGain = this._audioEngine.audioContext.createGain();
                this._soundGain.gain.value = this._volume;
                if (this.spatialSound) {
                    this._createSpatialParameters();
                } else {
                    this._audioNode = this._soundGain;
                }
                this._scene.mainSoundTrack.AddSound(this);
                if (typeof (urlOrArrayBuffer) === "string") {
                    BABYLON.Tools.LoadFile(urlOrArrayBuffer, function (data) {
                        _this._soundLoaded(data);
                    }, null, null, true);
                } else {
                    if (urlOrArrayBuffer instanceof ArrayBuffer) {
                        this._soundLoaded(urlOrArrayBuffer);
                    } else {
                        BABYLON.Tools.Error("Parameter must be a URL to the sound or an ArrayBuffer of the sound.");
                    }
                }
            }
        }
        Sound.prototype.updateOptions = function (options) {
            if (options) {
                this.loop = options.loop || this.loop;
                this.maxDistance = options.maxDistance || this.maxDistance;
                this.useCustomAttenuation = options.useCustomAttenation || this.useCustomAttenuation;
                this.rolloffFactor = options.rolloffFactor || this.rolloffFactor;
                this.refDistance = options.refDistance || this.refDistance;
                this.distanceModel = options.distanceModel || this.distanceModel;
                this.panningModel = options.panningModel || this.panningModel;
            }
        };

        Sound.prototype._createSpatialParameters = function () {
            this._soundPanner = this._audioEngine.audioContext.createPanner();

            if (this.useCustomAttenuation) {
                // Tricks to disable in a way embedded Web Audio attenuation
                this._soundPanner.distanceModel = "linear";
                this._soundPanner.maxDistance = Number.MAX_VALUE;
                this._soundPanner.refDistance = 1;
                this._soundPanner.rolloffFactor = 1;
                this._soundPanner.panningModel = "HRTF";
            } else {
                this._soundPanner.distanceModel = this.distanceModel;
                this._soundPanner.maxDistance = this.maxDistance;
                this._soundPanner.refDistance = this.refDistance;
                this._soundPanner.rolloffFactor = this.rolloffFactor;
                this._soundPanner.panningModel = this.panningModel;
            }
            this._soundPanner.connect(this._soundGain);
            this._audioNode = this._soundPanner;
        };

        Sound.prototype.connectToSoundTrackAudioNode = function (soundTrackAudioNode) {
            if (this._audioEngine.canUseWebAudio) {
                this._audioNode.disconnect();
                this._audioNode.connect(soundTrackAudioNode);
            }
        };

        /**
        * Transform this sound into a directional source
        * @param coneInnerAngle Size of the inner cone in degree
        * @param coneOuterAngle Size of the outer cone in degree
        * @param coneOuterGain Volume of the sound outside the outer cone (between 0.0 and 1.0)
        */
        Sound.prototype.setDirectionalCone = function (coneInnerAngle, coneOuterAngle, coneOuterGain) {
            if (coneOuterAngle < coneInnerAngle) {
                BABYLON.Tools.Error("setDirectionalCone(): outer angle of the cone must be superior or equal to the inner angle.");
                return;
            }
            this._coneInnerAngle = coneInnerAngle;
            this._coneOuterAngle = coneOuterAngle;
            this._coneOuterGain = coneOuterGain;
            this._isDirectional = true;

            if (this._isPlaying && this.loop) {
                this.stop();
                this.play();
            }
        };

        Sound.prototype.setPosition = function (newPosition) {
            this._position = newPosition;

            if (this._isPlaying && this.spatialSound) {
                this._soundPanner.setPosition(this._position.x, this._position.y, this._position.z);
            }
        };

        Sound.prototype.setLocalDirectionToMesh = function (newLocalDirection) {
            this._localDirection = newLocalDirection;

            if (this._connectedMesh && this._isPlaying) {
                this._updateDirection();
            }
        };

        Sound.prototype._updateDirection = function () {
            var mat = this._connectedMesh.getWorldMatrix();
            var direction = BABYLON.Vector3.TransformNormal(this._localDirection, mat);
            direction.normalize();
            this._soundPanner.setOrientation(direction.x, direction.y, direction.z);
        };

        Sound.prototype.updateDistanceFromListener = function () {
            if (this._connectedMesh && this.useCustomAttenuation) {
                var distance = this._connectedMesh.getDistanceToCamera(this._scene.activeCamera);
                this._soundGain.gain.value = this._customAttenuationFunction(this._volume, distance, this.maxDistance, this.refDistance, this.rolloffFactor);
            }
        };

        Sound.prototype.setAttenuationFunction = function (callback) {
            this._customAttenuationFunction = callback;
        };

        /**
        * Play the sound
        * @param time (optional) Start the sound after X seconds. Start immediately (0) by default.
        */
        Sound.prototype.play = function (time) {
            if (this._isReadyToPlay) {
                try  {
                    var startTime = time ? this._audioEngine.audioContext.currentTime + time : 0;
                    this._soundSource = this._audioEngine.audioContext.createBufferSource();
                    this._soundSource.buffer = this._audioBuffer;
                    if (this.spatialSound) {
                        this._soundPanner.setPosition(this._position.x, this._position.y, this._position.z);
                        if (this._isDirectional) {
                            this._soundPanner.coneInnerAngle = this._coneInnerAngle;
                            this._soundPanner.coneOuterAngle = this._coneOuterAngle;
                            this._soundPanner.coneOuterGain = this._coneOuterGain;
                            if (this._connectedMesh) {
                                this._updateDirection();
                            } else {
                                this._soundPanner.setOrientation(this._localDirection.x, this._localDirection.y, this._localDirection.z);
                            }
                        }
                    }
                    this._soundSource.connect(this._audioNode);
                    this._soundSource.loop = this.loop;
                    this.startTime = startTime;
                    this._soundSource.start(startTime, this.startOffset % this._soundSource.buffer.duration);
                    this._isPlaying = true;
                } catch (ex) {
                    BABYLON.Tools.Error("Error while trying to play audio: " + this._name + ", " + ex.message);
                }
            }
        };

        /**
        * Stop the sound
        * @param time (optional) Stop the sound after X seconds. Stop immediately (0) by default.
        */
        Sound.prototype.stop = function (time) {
            var stopTime = time ? this._audioEngine.audioContext.currentTime + time : 0;
            this._soundSource.stop(stopTime);
            this._isPlaying = false;
        };

        Sound.prototype.pause = function () {
            this._soundSource.stop(0);
            this.startOffset += this._audioEngine.audioContext.currentTime - this.startTime;
        };

        Sound.prototype.setVolume = function (newVolume) {
            this._volume = newVolume;
            this._soundGain.gain.value = newVolume;
        };

        Sound.prototype.getVolume = function () {
            return this._volume;
        };

        Sound.prototype.attachToMesh = function (meshToConnectTo) {
            var _this = this;
            this._connectedMesh = meshToConnectTo;
            if (!this.spatialSound) {
                this._createSpatialParameters();
                this.spatialSound = true;
                if (this._isPlaying && this.loop) {
                    this.stop();
                    this.play();
                }
            }
            meshToConnectTo.registerAfterWorldMatrixUpdate(function (connectedMesh) {
                return _this._onRegisterAfterWorldMatrixUpdate(connectedMesh);
            });
        };

        Sound.prototype._onRegisterAfterWorldMatrixUpdate = function (connectedMesh) {
            this.setPosition(connectedMesh.position);
            if (this._isDirectional && this._isPlaying) {
                this._updateDirection();
            }
        };

        Sound.prototype._soundLoaded = function (audioData) {
            var _this = this;
            this._isLoaded = true;
            this._audioEngine.audioContext.decodeAudioData(audioData, function (buffer) {
                _this._audioBuffer = buffer;
                _this._isReadyToPlay = true;
                if (_this.autoplay) {
                    _this.play();
                }
                if (_this._readyToPlayCallback) {
                    _this._readyToPlayCallback();
                }
            }, function (error) {
                BABYLON.Tools.Error("Error while decoding audio data: " + error.err);
            });
        };
        return Sound;
    })();
    BABYLON.Sound = Sound;
})(BABYLON || (BABYLON = {}));
//# sourceMappingURL=babylon.sound.js.map
