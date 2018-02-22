define([
        '../Core/BoxGeometry',
        '../Core/BoxOutlineGeometry',
        '../Core/Check',
        '../Core/Color',
        '../Core/ColorGeometryInstanceAttribute',
        '../Core/defined',
        '../Core/destroyObject',
        '../Core/DeveloperError',
        '../Core/DistanceDisplayConditionGeometryInstanceAttribute',
        '../Core/GeometryInstance',
        '../Core/Iso8601',
        '../Core/ShowGeometryInstanceAttribute',
        '../Scene/MaterialAppearance',
        '../Scene/PerInstanceColorAppearance',
        '../Scene/Primitive',
        './ColorMaterialProperty',
        './dynamicGeometryGetBoundingSphere',
        './GeometryUpdater',
        './MaterialProperty',
        './Property'
    ], function(
        BoxGeometry,
        BoxOutlineGeometry,
        Check,
        Color,
        ColorGeometryInstanceAttribute,
        defined,
        destroyObject,
        DeveloperError,
        DistanceDisplayConditionGeometryInstanceAttribute,
        GeometryInstance,
        Iso8601,
        ShowGeometryInstanceAttribute,
        MaterialAppearance,
        PerInstanceColorAppearance,
        Primitive,
        ColorMaterialProperty,
        dynamicGeometryGetBoundingSphere,
        GeometryUpdater,
        MaterialProperty,
        Property) {
    'use strict';

    var scratchColor = new Color();

    function BoxGeometryOptions(entity) {
        this.id = entity;
        this.vertexFormat = undefined;
        this.dimensions = undefined;
    }

    /**
     * A {@link GeometryUpdater} for boxes.
     * Clients do not normally create this class directly, but instead rely on {@link DataSourceDisplay}.
     * @alias BoxGeometryUpdater
     * @constructor
     *
     * @param {Entity} entity The entity containing the geometry to be visualized.
     * @param {Scene} scene The scene where visualization is taking place.
     */
    function BoxGeometryUpdater(entity, scene) {
        GeometryUpdater.call(this, {
            entity : entity,
            scene : scene,
            geometryOptions : new BoxGeometryOptions(entity),
            geometryPropertyName : 'box',
            observedPropertyNames : ['availability', 'position', 'orientation', 'box']
        });

        this._isClosed = true;
    }

    if (defined(Object.create)) {
        BoxGeometryUpdater.prototype = Object.create(GeometryUpdater.prototype);
        BoxGeometryUpdater.prototype.constructor = BoxGeometryUpdater;
    }

    /**
     * Creates the geometry instance which represents the fill of the geometry.
     *
     * @param {JulianDate} time The time to use when retrieving initial attribute values.
     * @returns {GeometryInstance} The geometry instance representing the filled portion of the geometry.
     *
     * @exception {DeveloperError} This instance does not represent a filled geometry.
     */
    BoxGeometryUpdater.prototype.createFillGeometryInstance = function(time) {
        //>>includeStart('debug', pragmas.debug);
        Check.defined('time', time);

        if (!this._fillEnabled) {
            throw new DeveloperError('This instance does not represent a filled geometry.');
        }
        //>>includeEnd('debug');

        var entity = this._entity;
        var isAvailable = entity.isAvailable(time);

        var attributes;

        var color;
        var show = new ShowGeometryInstanceAttribute(isAvailable && entity.isShowing && this._showProperty.getValue(time) && this._fillProperty.getValue(time));
        var distanceDisplayCondition = this._distanceDisplayConditionProperty.getValue(time);
        var distanceDisplayConditionAttribute = DistanceDisplayConditionGeometryInstanceAttribute.fromDistanceDisplayCondition(distanceDisplayCondition);
        if (this._materialProperty instanceof ColorMaterialProperty) {
            var currentColor = Color.WHITE;
            if (defined(this._materialProperty.color) && (this._materialProperty.color.isConstant || isAvailable)) {
                currentColor = this._materialProperty.color.getValue(time);
            }
            color = ColorGeometryInstanceAttribute.fromColor(currentColor);
            attributes = {
                show : show,
                distanceDisplayCondition : distanceDisplayConditionAttribute,
                color : color
            };
        } else {
            attributes = {
                show : show,
                distanceDisplayCondition : distanceDisplayConditionAttribute
            };
        }

        return new GeometryInstance({
            id : entity,
            geometry : BoxGeometry.fromDimensions(this._options),
            modelMatrix : entity.computeModelMatrix(Iso8601.MINIMUM_VALUE),
            attributes : attributes
        });
    };

    /**
     * Creates the geometry instance which represents the outline of the geometry.
     *
     * @param {JulianDate} time The time to use when retrieving initial attribute values.
     * @returns {GeometryInstance} The geometry instance representing the outline portion of the geometry.
     *
     * @exception {DeveloperError} This instance does not represent an outlined geometry.
     */
    BoxGeometryUpdater.prototype.createOutlineGeometryInstance = function(time) {
        //>>includeStart('debug', pragmas.debug);
        Check.defined('time', time);

        if (!this._outlineEnabled) {
            throw new DeveloperError('This instance does not represent an outlined geometry.');
        }
        //>>includeEnd('debug');

        var entity = this._entity;
        var isAvailable = entity.isAvailable(time);
        var outlineColor = Property.getValueOrDefault(this._outlineColorProperty, time, Color.BLACK);
        var distanceDisplayCondition = this._distanceDisplayConditionProperty.getValue(time);

        return new GeometryInstance({
            id : entity,
            geometry : BoxOutlineGeometry.fromDimensions(this._options),
            modelMatrix : entity.computeModelMatrix(Iso8601.MINIMUM_VALUE),
            attributes : {
                show : new ShowGeometryInstanceAttribute(isAvailable && entity.isShowing && this._showProperty.getValue(time) && this._showOutlineProperty.getValue(time)),
                color : ColorGeometryInstanceAttribute.fromColor(outlineColor),
                distanceDisplayCondition : DistanceDisplayConditionGeometryInstanceAttribute.fromDistanceDisplayCondition(distanceDisplayCondition)
            }
        });
    };

    BoxGeometryUpdater.prototype._isHidden = function(entity, box) {
        return !defined(box.dimensions) || !defined(entity.position) || GeometryUpdater.prototype._isHidden.call(this, entity, box);
    };

    BoxGeometryUpdater.prototype._isDynamic = function(entity, box) {
        return !entity.position.isConstant ||  !Property.isConstant(entity.orientation) ||  !box.dimensions.isConstant ||  !Property.isConstant(box.outlineWidth);
    };

    BoxGeometryUpdater.prototype._setStaticOptions = function(entity, box) {
        var isColorMaterial = this._materialProperty instanceof ColorMaterialProperty;

        var options = this._options;
        options.vertexFormat = isColorMaterial ? PerInstanceColorAppearance.VERTEX_FORMAT : MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat;
        options.dimensions = box.dimensions.getValue(Iso8601.MINIMUM_VALUE, options.dimensions);
    };

    BoxGeometryUpdater.DynamicGeometryUpdater = DynamicGeometryUpdater;

    /**
     * @private
     */
    function DynamicGeometryUpdater(geometryUpdater, primitives) {
        this._primitives = primitives;
        this._primitive = undefined;
        this._outlinePrimitive = undefined;
        this._geometryUpdater = geometryUpdater;
        this._entity = geometryUpdater._entity;
        this._options = new BoxGeometryOptions(geometryUpdater._entity);
    }

    DynamicGeometryUpdater.prototype.update = function(time) {
        //>>includeStart('debug', pragmas.debug);
        Check.defined('time', time);
        //>>includeEnd('debug');

        var primitives = this._primitives;
        primitives.removeAndDestroy(this._primitive);
        primitives.removeAndDestroy(this._outlinePrimitive);
        this._primitive = undefined;
        this._outlinePrimitive = undefined;

        var geometryUpdater = this._geometryUpdater;
        var entity = this._entity;
        var box = entity.box;
        if (!entity.isShowing || !entity.isAvailable(time) || !Property.getValueOrDefault(box.show, time, true)) {
            return;
        }

        var options = this._options;
        var modelMatrix = entity.computeModelMatrix(time);
        var dimensions = Property.getValueOrUndefined(box.dimensions, time, options.dimensions);
        if (!defined(modelMatrix) || !defined(dimensions)) {
            return;
        }

        options.dimensions = dimensions;

        var shadows = this._geometryUpdater.shadowsProperty.getValue(time);

        var distanceDisplayConditionProperty = this._geometryUpdater.distanceDisplayConditionProperty;
        var distanceDisplayCondition = distanceDisplayConditionProperty.getValue(time);
        var distanceDisplayConditionAttribute = DistanceDisplayConditionGeometryInstanceAttribute.fromDistanceDisplayCondition(distanceDisplayCondition);

        if (Property.getValueOrDefault(box.fill, time, true)) {
            var material = MaterialProperty.getValue(time, geometryUpdater.fillMaterialProperty, this._material);
            this._material = material;

            var appearance = new MaterialAppearance({
                material : material,
                translucent : material.isTranslucent(),
                closed : true
            });
            options.vertexFormat = appearance.vertexFormat;

            this._primitive = primitives.add(new Primitive({
                geometryInstances : new GeometryInstance({
                    id : entity,
                    geometry : BoxGeometry.fromDimensions(options),
                    modelMatrix : modelMatrix,
                    attributes : {
                        distanceDisplayCondition : distanceDisplayConditionAttribute
                    }
                }),
                appearance : appearance,
                asynchronous : false,
                shadows : shadows
            }));
        }

        if (Property.getValueOrDefault(box.outline, time, false)) {
            options.vertexFormat = PerInstanceColorAppearance.VERTEX_FORMAT;

            var outlineColor = Property.getValueOrClonedDefault(box.outlineColor, time, Color.BLACK, scratchColor);
            var outlineWidth = Property.getValueOrDefault(box.outlineWidth, time, 1.0);
            var translucent = outlineColor.alpha !== 1.0;

            this._outlinePrimitive = primitives.add(new Primitive({
                geometryInstances : new GeometryInstance({
                    id : entity,
                    geometry : BoxOutlineGeometry.fromDimensions(options),
                    modelMatrix : modelMatrix,
                    attributes : {
                        color : ColorGeometryInstanceAttribute.fromColor(outlineColor),
                        distanceDisplayCondition : distanceDisplayConditionAttribute
                    }
                }),
                appearance : new PerInstanceColorAppearance({
                    flat : true,
                    translucent : translucent,
                    renderState : {
                        lineWidth : geometryUpdater._scene.clampLineWidth(outlineWidth)
                    }
                }),
                asynchronous : false,
                shadows : shadows
            }));
        }
    };

    DynamicGeometryUpdater.prototype.getBoundingSphere = function(result) {
        return dynamicGeometryGetBoundingSphere(this._entity, this._primitive, this._outlinePrimitive, result);
    };

    DynamicGeometryUpdater.prototype.isDestroyed = function() {
        return false;
    };

    DynamicGeometryUpdater.prototype.destroy = function() {
        var primitives = this._primitives;
        primitives.removeAndDestroy(this._primitive);
        primitives.removeAndDestroy(this._outlinePrimitive);
        destroyObject(this);
    };

    return BoxGeometryUpdater;
});
