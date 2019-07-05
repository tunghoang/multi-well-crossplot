var componentName = 'multiCrossplot';
module.exports.name = componentName;
require('./style.less');

var app = angular.module(componentName, ['multiWellCrossplot','wiLoading']);
app.component(componentName, {
    template: require('./template.html'),
    controller: multiCrossplotController,
    controllerAs: 'self',
    bindings: {
        token: "<",
        idProject: "<",
        wellSpecs: "=",
        zonesetNames: "<",
        selectionTypes: "<",
        selectionXValues: "<",
        selectionYValues: "<",
        selectionZ1Values: "<",
        selectionZ2Values: "<",
        selectionZ3Values: "<",
		idHistograms: "<",
		configs: '<',
        onSave: '<',
        onSaveAs: '<',
		titles: '<'
    },
    transclude: true
});

function multiCrossplotController($scope, $timeout, $element, wiToken, wiApi, wiDialog, wiLoading) {
    let self = this;
    self.silent = true;
    $scope.tabIndex = 0;

    this.$onInit = async function () {
        if (self.token)
            wiToken.setToken(self.token);
    }
    self.activateTab = function ($index){
        $timeout(()=>{
            $scope.tabIndex = $index;
        })

    }
    this.onDrop = function (event, helper, myData) {
        let idCurves = helper.data("idCurves");
        let selectionXValue;
        let idWell;
        if(idCurves && idCurves.length >= 2){
            $timeout(()=>{
                self.warning = false;
            })
            wiApi.getCurveInfoPromise(idCurves[0]).then(curveInfo => {
                selectionXValue = curveInfo.name;
                return wiApi.getDatasetInfoPromise(curveInfo.idDataset);
            }).then(datasetInfo => {
                idWell = datasetInfo.idWell;
                $timeout(()=>{
                    self.wellSpecs.push([{idWell}]);
                    self.selectionTypes.push('curve');
                    self.selectionXValues.push(selectionXValue);
                    wiApi.getCurveInfoPromise(idCurves[1]).then(curveInfo => {
                        // console.log(curveInfo.name);
                        $timeout(()=>{
                            self.selectionYValues.push(curveInfo.name);
                        });
                    })
                });
            });
            
        } else {
            $timeout(()=>{
                self.warning = true;
            })
        }
        
    }
    this.removeTab = function ($event, index){
        $event.stopPropagation();
        $event.preventDefault();
        $timeout(() => {
            self.wellSpecs.splice(index, 1);
        })
    }
}
