/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import {
  // @ts-ignore
  EuiButtonGroup,
  EuiIcon,
  EuiIconTip,
  // @ts-ignore
  EuiInMemoryTable,
  EuiText,
} from '@elastic/eui';
import { FormattedMessage, InjectedIntl } from '@kbn/i18n/react';
import _ from 'lodash';
import React, { Component } from 'react';
import { Feature } from 'x-pack/plugins/xpack_main/types';
import { FeaturesPrivileges, KibanaPrivileges, Role } from '../../../../../../../../common/model';
import {
  AllowedPrivilege,
  CalculatedPrivilege,
  PrivilegeExplanation,
} from '../../../../../../../lib/kibana_privilege_calculator';
import { isGlobalPrivilegeDefinition } from '../../../../../../../lib/privilege_utils';
import { NO_PRIVILEGE_VALUE } from '../../../../lib/constants';
import { PrivilegeDisplay } from '../space_aware_privilege_section/privilege_display';
import { ChangeAllPrivilegesControl } from './change_all_privileges';

interface Props {
  role: Role;
  features: Feature[];
  calculatedPrivileges: CalculatedPrivilege;
  allowedPrivileges: AllowedPrivilege;
  rankedFeaturePrivileges: FeaturesPrivileges;
  kibanaPrivileges: KibanaPrivileges;
  intl: InjectedIntl;
  spacesIndex: number;
  onChange: (featureId: string, privileges: string[]) => void;
  onChangeAll: (privileges: string[]) => void;
  disabled?: boolean;
}

interface TableFeature extends Feature {
  hasAnyPrivilegeAssigned: boolean;
}

interface TableRow {
  feature: TableFeature;
  role: Role;
}

export class FeatureTable extends Component<Props, {}> {
  public static defaultProps = {
    spacesIndex: -1,
    showLocks: true,
  };

  public render() {
    const { role, features, calculatedPrivileges, rankedFeaturePrivileges } = this.props;

    const items: TableRow[] = features.map(feature => ({
      feature: {
        ...feature,
        hasAnyPrivilegeAssigned:
          calculatedPrivileges.feature[feature.id].actualPrivilege !== NO_PRIVILEGE_VALUE,
      },
      role,
    }));

    // TODO: This simply grabs the available privileges from the first feature we encounter.
    // As of now, features can have 'all' and 'read' as available privileges. Once that assumption breaks,
    // this will need updating. This is a simplifying measure to enable the new UI.
    const availablePrivileges = Object.values(rankedFeaturePrivileges)[0];

    return (
      // @ts-ignore missing responsive from typedef
      <EuiInMemoryTable
        // @ts-ignore missing rowProps from typedef
        responsive={false}
        columns={this.getColumns(availablePrivileges)}
        items={items}
      />
    );
  }

  public onChange = (featureId: string) => (featurePrivilegeId: string) => {
    const privilege = featurePrivilegeId.substr(`${featureId}_`.length);
    if (privilege === NO_PRIVILEGE_VALUE) {
      this.props.onChange(featureId, []);
    } else {
      this.props.onChange(featureId, [privilege]);
    }
  };

  private getColumns = (availablePrivileges: string[]) => [
    {
      field: 'feature',
      name: this.props.intl.formatMessage({
        id: 'xpack.security.management.editRole.featureTable.enabledRoleFeaturesFeatureColumnTitle',
        defaultMessage: 'Feature',
      }),
      render: (feature: TableFeature) => {
        let tooltipElement = null;
        if (feature.privilegesTooltip) {
          const tooltipContent = (
            <EuiText>
              <p>{feature.privilegesTooltip}</p>
            </EuiText>
          );
          tooltipElement = (
            <EuiIconTip
              iconProps={{
                className: 'eui-alignTop',
              }}
              type={'iInCircle'}
              color={'subdued'}
              content={tooltipContent}
            />
          );
        }

        return (
          <span>
            <EuiIcon size="m" type={feature.icon} className="secPrivilegeFeatureIcon" />
            {feature.name} {tooltipElement}
          </span>
        );
      },
    },
    {
      field: 'privilege',
      name: (
        <span>
          <FormattedMessage
            id="xpack.security.management.editRole.featureTable.enabledRoleFeaturesEnabledColumnTitle"
            defaultMessage="Privilege"
          />
          {!this.props.disabled && (
            <ChangeAllPrivilegesControl
              privileges={[...availablePrivileges, NO_PRIVILEGE_VALUE]}
              onChange={this.onChangeAllFeaturePrivileges}
            />
          )}
        </span>
      ),
      render: (roleEntry: Role, record: TableRow) => {
        const featureId = record.feature.id;

        const featurePrivileges = this.props.kibanaPrivileges
          .getFeaturePrivileges()
          .getPrivileges(featureId);

        if (!featurePrivileges) {
          return null;
        }

        const enabledFeaturePrivileges = this.getEnabledFeaturePrivileges(
          featurePrivileges,
          featureId
        );

        const privilegeExplanation = this.getPrivilegeExplanation(featureId);

        const allowsNone = this.allowsNoneForPrivilegeAssignment(featureId);

        const actualPrivilegeValue = privilegeExplanation.actualPrivilege;

        const canChangePrivilege =
          !this.props.disabled && (allowsNone || enabledFeaturePrivileges.length > 1);

        if (!canChangePrivilege) {
          return (
            <PrivilegeDisplay privilege={actualPrivilegeValue} explanation={privilegeExplanation} />
          );
        }

        const options = availablePrivileges.map(priv => {
          return {
            id: `${featureId}_${priv}`,
            label: _.capitalize(priv),
            isDisabled: !enabledFeaturePrivileges.includes(priv),
          };
        });

        options.push({
          id: `${featureId}_${NO_PRIVILEGE_VALUE}`,
          label: 'None',
          isDisabled: !allowsNone,
        });

        return (
          // @ts-ignore missing name from typedef
          <EuiButtonGroup
            // @ts-ignore missing rowProps from typedef
            name={`featurePrivilege_${featureId}`}
            options={options}
            idSelected={`${featureId}_${actualPrivilegeValue || NO_PRIVILEGE_VALUE}`}
            onChange={this.onChange(featureId)}
          />
        );
      },
    },
  ];

  private getEnabledFeaturePrivileges = (featurePrivileges: string[], featureId: string) => {
    const { allowedPrivileges } = this.props;

    if (this.isConfiguringGlobalPrivileges()) {
      // Global feature privileges are not limited by effective privileges.
      return featurePrivileges;
    }

    return allowedPrivileges.feature[featureId].privileges;
  };

  private getPrivilegeExplanation = (featureId: string): PrivilegeExplanation => {
    const { calculatedPrivileges } = this.props;

    return calculatedPrivileges.feature[featureId];
  };

  private allowsNoneForPrivilegeAssignment = (featureId: string): boolean => {
    const { allowedPrivileges } = this.props;
    return allowedPrivileges.feature[featureId].canUnassign;
  };

  private onChangeAllFeaturePrivileges = (privilege: string) => {
    if (privilege === NO_PRIVILEGE_VALUE) {
      this.props.onChangeAll([]);
    } else {
      this.props.onChangeAll([privilege]);
    }
  };

  private isConfiguringGlobalPrivileges = () =>
    isGlobalPrivilegeDefinition(this.props.role.kibana[this.props.spacesIndex]);
}