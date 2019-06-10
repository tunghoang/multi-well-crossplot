var componentName = 'multiWellCrossplot';
module.exports.name = componentName;
require('./style.less');

const _DECIMAL_LEN = 4;

var app = angular.module(componentName, [
    'sideBar', 'wiTreeView', 'wiTableView',
    'wiApi', 'editable', 'wiDialog',
    'wiDroppable', 'wiDropdownList','plot-toolkit','wiLoading'
]);
app.component(componentName, {
    template: require('./template.html'),
    controller: multiWellCrossplotController,
    controllerAs: 'self',
    bindings: {
        token: "<",
        idProject: "<",
        wellSpec: "<",
        zonesetName: "<",
        selectionType: "<",
        selectionXValue: "<",
        selectionYValue: "<",
		idCrossplot: "<",
		config: '<'
    },
    transclude: true
});

function multiWellCrossplotController($scope, $timeout, $element, wiToken, wiApi, wiDialog, wiLoading) {
    let self = this;
    self.treeConfig = [];
    self.selectedNode = null;
    self.datasets = {};
    //--------------
    $scope.tab = 1;
    self.selectionTab = self.selectionTab || 'Wells';

    $scope.setTab = function(newTab){
      $scope.tab = newTab;
    };

    $scope.isSet = function(tabNum){
      return $scope.tab === tabNum;
    };

    //--------------
    this.getDataset = function(well) {
        wiApi.getCachedWellPromise(well.idWell).then((well) => {
            self.datasets[well] = well.datasets;
        }).catch(e => console.error(e));
    }
    
    function getCurvesInWell(well) {
        let curves = [];
        well.datasets.forEach(dataset => {
            curves.push(...dataset.curves);
        });
        return curves;
    }

    function getFamilyInWell(well) {
        let curves = getCurvesInWell(well);
        let familyList = curves.map(c => wiApi.getFamily(c.idFamily));
        return familyList;
    }
    this.$onInit = function () {
        if (self.token)
            wiToken.setToken(self.token);
        $timeout(() => {
            $scope.$watch(() => (self.wellSpec.map(wsp => wsp.idWell)), () => {
                getTree();
            }, true);
            $scope.$watch(() => (self.selectionType), () => {
                getSelectionList(self.selectionType, self.treeConfig);
                updateDefaultConfig();
            });
            $scope.$watch(() => (self.selectionXValue), () => {
                updateDefaultConfig();
            });
            $scope.$watch(() => (self.selectionYValue), () => {
                updateDefaultConfig();
            });
            $scope.$watch(() => (self.treeConfig.map(w => w.idWell)), () => {
                getSelectionList(self.selectionType, self.treeConfig);
                getZonesetsFromWells(self.treeConfig);
                updateDefaultConfig();
            }, true);
            // $scope.$watch(() => (
            //     `${self.getLeft()}-${self.getRight()}-${self.getLoga()}-${self.selectionXValue}-${self.selectionYValue}`
            // ), () => {
            //     _crossplotGen = null;
            // });
        }, 500);

        self.defaultConfig = self.defaultConfig || {};
        self.wellSpec = self.wellSpec || [];
        self.selectionType = self.selectionType || 'family-group';
        self.zoneTree = [];
        self.zonesetName = self.zonesetName || "ZonationAll";
        self.config = self.config || {grid:true, displayMode: 'bar', colorMode: 'zone', stackMode: 'well', binGap: 5};
    }

    this.onInputXSelectionChanged = function(selectedItemProps) {
        self.selectionXValue = (selectedItemProps || {}).name;
    }

    this.onInputYSelectionChanged = function(selectedItemProps) {
        self.selectionYValue = (selectedItemProps || {}).name;
    }

    function getSelectionList(selectionType, wellArray) {
        let selectionHash = {};
        let allCurves = [];
        wellArray.forEach(well => {
            let curvesInWell = getCurvesInWell(well);
            allCurves.push(...curvesInWell);
        });
        switch(selectionType) {
            case 'curve':
                allCurves.forEach(curve => {
                    selectionHash[curve.name] = 1;
                })
                break;
            case 'family': 
                allCurves.forEach(curve => {
                    let family = wiApi.getFamily(curve.idFamily);
                    if(family)
                        selectionHash[family.name] = 1;
                })
                break;
            case 'family-group':
                allCurves.forEach(curve => {
                    let family = wiApi.getFamily(curve.idFamily);
                    if(family)
                        selectionHash[family.familyGroup] = 1;
                })
                break;
        }
        self.selectionList = Object.keys(selectionHash).map(item => ({ 
            data:{label:item}, 
            properties:{name:item} 
        }));
    }
    
    this.runMatch = function (node, criteria) {
        let family;
        if (!criteria) return true;
        switch(self.selectionType) {
            case 'family-group': 
                family = wiApi.getFamily(node.idFamily);
                if (!family) return null;
                return family.familyGroup.trim().toLowerCase() === criteria.trim().toLowerCase();
            
            case 'family': 
                family = wiApi.getFamily(node.idFamily);
                if (!family) return null;
                return family.name.trim().toLowerCase() === criteria.trim().toLowerCase();
            
            case 'curve':
                return node.name.trim().toLowerCase() === criteria.trim().toLowerCase();
        }
    }
    this.getLabel = function (node) {
        return node.name;
    }
    this.getIcon = function (node) {
        if (node.idCurve) return 'curve-16x16';
        if (node.idDataset) return 'curve-data-16x16';
        if (node.idWell) return 'well-16x16';
    }
    this.getChildren = function (node) {
        if (node.idDataset) {
            return node.curves;
        }
        if (node.idWell) {
            return node.datasets;
        }
        return [];
    }
    this.clickFunction = clickFunction;
    function clickFunction($event, node, selectedObjs, treeRoot) {
        let wellSpec = self.wellSpec.find(wsp => wsp.idWell === treeRoot.idWell);
		switch(treeRoot.isSettingAxis) {
			case 'xAxis':
				wellSpec.xAxis = {};
				wellSpec.xAxis.idCurve = node.idCurve;
				wellSpec.xAxis.idDataset = node.idDataset;
				break;
			case 'yAxis':
				wellSpec.yAxis = {};
				wellSpec.yAxis.idCurve = node.idCurve;
				wellSpec.yAxis.idDataset = node.idDataset;
				break;
		}
    }
    this.refresh = function(){
        self.treeConfig.length = 0;
        getTree();
    };
    async function getTree(callback) {
        wiLoading.show($element.find('.main')[0]);
        self.treeConfig = [];
        let promises = [];
		for (let w of self.wellSpec) {
			try {
				let well = await wiApi.getCachedWellPromise(w.idWell || w);
				well.isSettingAxis = 'xAxis';
				$timeout(() => self.treeConfig.push(well));
			}
			catch(e) {
				console.error(e);
			}
		}
		callback && callback();
		wiLoading.hide();
        // for (let w of self.wellSpec) {
        //     promises.push(
        //         wiApi.getWellPromise(w.idWell || w)
        //             .then(well => ($timeout(() => self.treeConfig.push(well))))
        //     );
        // }
        /*Promise.all(promises)
            .then(() => callback && callback())
            .catch(e => console.error(e))
            .finally(() => wiLoading.hide());
		*/
    }
    function getZonesetsFromWells(wells) {
        let zsList;
        for (let well of wells) {
            let zonesets = well.zone_sets;
            if (!zsList) {
                zsList = angular.copy(zonesets);
            }
            else if (zsList.length) {
                zsList = intersectAndMerge(zsList, zonesets);
            }
            else {
                break;
            }
        }
        self.zonesetList = (zsList || []).map( zs => ({
            data: {
                label: zs.name
            },
            properties: zs
        }));
        self.zonesetList.splice(0, 0, {data: {label: 'ZonationAll'}, properties: genZonationAllZS(0, 1)});
    }
    function intersectAndMerge(dstZoneList, srcZoneList) {
        return dstZoneList.filter(zs => {
            let zoneset = srcZoneList.find(zs1 => zs.name === zs1.name);
            if (!zoneset) return false;
            for (let z of zoneset.zones) {
                let zone = zs.zones.find(zo => zo.zone_template.name == z.zone_template.name);
                if (!zone) {
                    zs.zones.push(angular.copy(z));
                }
            }
            return true;
        });
    }
    this.getWellSpec = getWellSpec;
    function getWellSpec(well) {
        if (!well) return {};
        return self.wellSpec.find(wsp => wsp.idWell === well.idWell);
    }
    this.getCurve = getCurve;
    function getCurve(well, requiredAxis) {
        let wellSpec = getWellSpec(well);
        if (!Object.keys(wellSpec).length) return {};
		let axis = requiredAxis || well.isSettingAxis;
        let curves = getCurvesInWell(well).filter(c => self.runMatch(c, axis == 'xAxis' ? self.selectionXValue : self.selectionYValue));
        let curve = wellSpec[axis] && wellSpec[axis].idCurve ? curves.find(c => c.idCurve === wellSpec[axis].idCurve) : curves[0];
        if (!curve) {
			wellSpec[axis] = {};
            return;
        }
		wellSpec[axis] = {}
        wellSpec[axis].curveName = curve.name;
		wellSpec[axis].idCurve = curve.idCurve;
		wellSpec[axis].idDataset = curve.idDataset;

        let datasets = self.getChildren(well);
        let dataset = wellSpec[axis] && wellSpec[axis].idDataset ? datasets.find(ds => ds.idDataset === wellSpec[axis].idDataset):datasets[0];
        wellSpec[axis].datasetName = dataset.name;
        wellSpec[axis].datasetTop = parseFloat(dataset.top);
        wellSpec[axis].datasetBottom = parseFloat(dataset.bottom);
        wellSpec[axis].datasetStep = parseFloat(dataset.step);
        return curve;
    }
    function getZoneset(well, zonesetName = "") {
        let zonesets = well.zone_sets;
        if (zonesetName === "" || zonesetName === "ZonationAll") 
            return null;
        return zonesets.find(zs => zs.name === zonesetName);
    }
    this.onZonesetSelectionChanged = function(selectedItemProps) {
        self.zoneTree = (selectedItemProps || {}).zones;
        self.zonesetName = (selectedItemProps || {}).name || 'ZonationAll';
    }
    this.runZoneMatch = function (node, criteria) {
        let keySearch = criteria.toLowerCase();
        let searchArray = node.zone_template.name.toLowerCase();
        return searchArray.includes(keySearch);
    }
    this.getZoneLabel = function (node) {
        if(!node || !node.zone_template){
            return 'aaa';
        }
        return node.zone_template.name;
    }
   
    this.getZoneIcon = (node) => ( (node && !node._notUsed) ? 'zone-16x16': 'fa fa-eye-slash' )
    const EMPTY_ARRAY = []
    this.noChildren = function (node) {
        return EMPTY_ARRAY;
    }
    this.click2ToggleZone = function ($event, node, selectedObjs) {
        node._notUsed = !node._notUsed;
        self.selectedZones = Object.values(selectedObjs).map(o => o.data);
    }
    
    this.getConfigLeft = function() {
        self.config = self.config || {};
        return isNaN(self.config.left) ? "[empty]": wiApi.bestNumberFormat(self.config.left, 3);
    }
    this.getConfigLimitTop = function () {
        self.config = self.config || {};
        return isNaN(self.config.limitTop) ? "[empty]": wiApi.bestNumberFormat(self.config.limitTop, 3);
    }
    this.getConfigLimitBottom = function () {
        self.config = self.config || {};
        return isNaN(self.config.limitBottom) ? "[empty]": wiApi.bestNumberFormat(self.config.limitBottom, 3);
    }
    this.setConfigLimitTop = function (notUse, newValue) {
        self.config.limitTop = parseFloat(newValue)
    }
    this.setConfigLimitBottom = function (notUse, newValue) {
        self.config.limitBottom = parseFloat(newValue)
    }
    this.setConfigLeft = function(notUse, newValue) {
        self.config.left = parseFloat(newValue);
    }
    this.getConfigRight = function() {
        self.config = self.config || {};
        return isNaN(self.config.right) ? "[empty]": wiApi.bestNumberFormat(self.config.right, 3);
    }
    this.setConfigRight = function(notUse, newValue) {
        self.config.right = parseFloat(newValue);
    }
    this.getConfigTop = function() {
        self.config = self.config || {};
        return isNaN(self.config.top) ? "[empty]": wiApi.bestNumberFormat(self.config.top, 3);
    }
    this.setConfigTop = function(notUse, newValue) {
        self.config.top = parseFloat(newValue);
    }
    this.getConfigBottom = function() {
        self.config = self.config || {};
        return isNaN(self.config.bottom) ? "[empty]": wiApi.bestNumberFormat(self.config.bottom, 3);
    }
    this.setConfigBottom = function(notUse, newValue) {
        self.config.bottom = parseFloat(newValue);
    }
    this.getConfigTitle = function() {
        self.config = self.config || {};
        return (self.config.title || "").length ? self.config.title : "New Crossplot";
    }
    this.setConfigTitle = function(notUse, newValue) {
        self.config.title = newValue;
    }
    this.getConfigXLabel = function() {
        self.config = self.config || {};
        return (self.config.xLabel || "").length ? self.config.xLabel : self.selectionXValue;
    }
    this.setConfigXLabel = function(notUse, newValue) {
        self.config.xLabel = newValue;
    }
    this.getConfigYLabel = function() {
        self.config = self.config || {};
        return (self.config.yLabel || "").length ? self.config.yLabel : self.selectionYValue;
    }
    this.setConfigYLabel = function(notUse, newValue) {
        self.config.yLabel = newValue;
    }
    function clearDefaultConfig() {
        self.defaultConfig = {};
    }
    function updateDefaultConfig() {
        clearDefaultConfig();
        let curve = getCurve(self.treeConfig[0]);
        if (!curve) return;
        let family = wiApi.getFamily(curve.idFamily);
        if (!family) return;
        self.defaultConfig.left = family.family_spec[0].minScale;
        self.defaultConfig.right = family.family_spec[0].maxScale;

		let datasetTopArr = [];
		let datasetBottomArr = [];
		self.wellSpec.forEach(ws => {
			if (ws.xAxis) {
				datasetTopArr.push(ws.xAxis.datasetTop);
				datasetBottomArr.push(ws.xAxis.datasetBottom);
			}
			if (ws.yAxis) {
				datasetTopArr.push(ws.yAxis.datasetTop);
				datasetBottomArr.push(ws.yAxis.datasetBottom);
			}
		})
		self.defaultConfig.top = d3.min(datasetTopArr);
		self.defaultConfig.bottom = d3.max(datasetBottomArr);
		console.log(self.defaultConfig);
        self.defaultConfig.loga = family.family_spec[0].displayType.toLowerCase() === 'logarithmic';
    }

    function genZonationAllZS(top, bottom, color = 'blue') {
        return {
            name: 'ZonationAll',
            zones: [{
                startDepth: top,
                endDepth: bottom,
                zone_template: {
                    name: 'ZonationAll',
                    background: color
                }
            }]
        }
    }
    function filterData(curveData, zone) {
        return curveData.filter(d => ((zone.startDepth - d.depth)*(zone.endDepth - d.depth) <= 0));
    }

    this.getTop = () => ( self.config.top || self.defaultConfig.top || 0 )
    this.getBottom = () => ( self.config.bottom || self.defaultConfig.bottom || 0 )
    this.getLeft = () => ( self.config.left || self.defaultConfig.left || 0 )
    this.getRight = () => ( self.config.right || self.defaultConfig.right || 0 )
    this.getLoga = () => (self.config.loga || self.defaultConfig.loga || 0)
    this.getColorMode = () => (self.config.colorMode || self.defaultConfig.colorMode || 'zone')
    this.getColor = (zone, well) => {
        let cMode = self.getColorMode();
        return cMode === 'zone' ? zone.zone_template.background:(cMode === 'well'?well.color:'blue');
    }
    this.getDisplayMode = () => (self.config.displayMode || self.defaultConfig.displayMode || 'bar')
    this.getStackMode = () => (self.config.stackMode || self.defaultConfig.stackMode || 'none')
    this.getBinGap = () => (self.config.binGap || self.defaultConfig.binGap)
    this.getBinX = (bin) => ((bin.x0 + bin.x1)/2)
    this.getBinY = (bin) => (bin.length)

    this.colorFn = function(bin, bins) {
        if (self.getStackMode() === 'none');
        return bins.color;
    }

	this.saveToAsset = function() {
		let type = 'CROSSPLOT';
		let content = {
			wellSpec: self.wellSpec,
			zonesetName: self.zonesetName,
			selectionType: self.selectionType,
			selectionXValue: self.selectionXValue,
			selectionYValue: self.selectionYValue,
			config: self.config	
		}
		if (!self.idCrossplot) {
			wiDialog.promptDialog({
				title: 'New Crossplot',
				inputName: 'Crossplot Name',
				input: self.getConfigTitle(),
			}, function(name) {
				wiApi.newAssetPromise(self.idProject, name, type, content).then(res => {
					self.setConfigTitle(null, name);
					self.idCrossplot = res.idParameterSet;
					console.log(res);
				})
					.catch(e => {
						console.error(e);
						self.saveToAsset();
					})
			});
		}
		else {
			content.idParameterSet = self.idParameterSet;
			wiApi.editAssetPromise(self.idCrossplot, content).then(res => {
				console.log(res);
			})
				.catch(e => {
					console.error(e);
				});
		}
	}

    let _zoneNames = []
    self.getZoneNames = function() {
        _zoneNames.length = 0;
        Object.assign(_zoneNames, self.crossplotList.map(bins => bins.name));
        return _zoneNames;
    }

    //--------------

    this.hideSelectedZone = function() {
        if(!self.selectedZones) return;
        self.selectedZones.forEach(layer => layer._notUsed = true);
    }
    this.showSelectedZone = function() {
        if(!self.selectedZones) return;
        self.selectedZones.forEach(layer => layer._notUsed = false);
        $timeout(() => {});
    }
    this.hideAllZone = function() {
        self.zoneTree.forEach(bins => bins._notUsed = true);
        $timeout(() => {});
    }
    this.showAllZone = function() {
        self.zoneTree.forEach(bins => bins._notUsed = false);
        $timeout(() => {});
    }
    this.onDrop = function (event, helper, myData) {
        let idWells = helper.data('idWells');
        if (idWells && idWells.length) {
            $timeout(() => {
                for (let idWell of idWells) {
                    if (!self.wellSpec.find(wsp => wsp.idWell === idWell)) {
                        self.wellSpec.push({idWell});
                    }
                }
            })
        }
    }
    this.toggleWell = function(well) {
        well._notUsed = !well._notUsed;
    }
    this.removeWell = function(well) {
        let index = self.wellSpec.findIndex(wsp => wsp.idWell === well.idWell);
        if(index >= 0) {
            self.wellSpec.splice(index, 1);
        }
    }
    
}
