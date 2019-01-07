import React from 'react';
import PropTypes from 'prop-types';
import { FormattedMessage } from 'react-intl';
import { graphql, compose } from 'react-apollo';
import gql from 'graphql-tag';
import { get, pick } from 'lodash';
import { Box, Flex } from '@rebass/grid';
import styled from 'styled-components';

import { Router } from '../server/pages';

import { H2, P, Span } from '../components/Text';
import Logo from '../components/Logo';
import ErrorPage from '../components/ErrorPage';
import Page from '../components/Page';
import Link from '../components/Link';
import SignIn from '../components/SignIn';
import CreateProfile from '../components/CreateProfile';
import ContributeAs from '../components/ContributeAs';
import StyledInputField from '../components/StyledInputField';

import { addCreateOrderMutation, createUserQuery } from '../graphql/mutations';

import * as api from '../lib/api';
import withIntl from '../lib/withIntl';
import { withUser } from '../components/UserProvider';
import ContributePayment from '../components/ContributePayment';
import Loading from '../components/Loading';
import StyledButton from '../components/StyledButton';
import StepsProgress from '../components/StepsProgress';

const STEPS = ['contributeAs', 'details', 'payment'];

const StepLabel = styled(Span)`
  text-transform: uppercase;
`;
StepLabel.defaultProps = { color: 'black.400', fontSize: 'Tiny', mt: 1 };

const PrevNextButton = styled(StyledButton)``;
PrevNextButton.defaultProps = { buttonSize: 'large', fontWeight: 'bold', mx: 2 };

class CreateOrderPage extends React.Component {
  static getInitialProps({
    query: {
      collectiveSlug,
      eventSlug,
      TierId,
      amount,
      quantity,
      totalAmount,
      interval,
      description,
      verb,
      step,
      redeem,
      redirect,
    },
  }) {
    return {
      slug: eventSlug || collectiveSlug,
      TierId,
      quantity,
      totalAmount: totalAmount || amount * 100,
      interval,
      description,
      verb,
      step,
      redeem,
      redirect,
    };
  }

  static propTypes = {
    slug: PropTypes.string, // for addData
    TierId: PropTypes.string,
    quantity: PropTypes.number,
    totalAmount: PropTypes.number,
    interval: PropTypes.string,
    description: PropTypes.string,
    verb: PropTypes.string,
    step: PropTypes.string,
    redirect: PropTypes.string,
    redeem: PropTypes.bool,
    createOrder: PropTypes.func.isRequired, // from addCreateOrderMutation
    data: PropTypes.object.isRequired, // from withData
    intl: PropTypes.object.isRequired, // from withIntl
  };

  constructor(props) {
    super(props);
    const interval = (props.interval || '').toLowerCase().replace(/ly$/, '');
    this.order = {
      quantity: parseInt(props.quantity, 10) || 1,
      interval: ['month', 'year'].indexOf(interval) !== -1 ? interval : null,
      totalAmount: parseInt(props.totalAmount, 10) || null,
    };
    this.state = {
      loading: false,
      submitting: false,
      result: {},
      unknownEmail: false,
      signIn: true,
      stepProfile: this.getLoggedInUserDefaultContibuteProfile(),
      stepPayment: null,
      stepDetails: null,
    };
  }

  componentDidUpdate(prevProps) {
    if (!prevProps.LoggedInUser && this.props.LoggedInUser && !this.state.stepProfile) {
      this.setState({ stepProfile: this.getLoggedInUserDefaultContibuteProfile() });
    }
  }

  signIn = email => {
    if (this.state.submitting) {
      return false;
    }

    this.setState({ submitting: true });
    return api
      .checkUserExistence(email)
      .then(exists => {
        if (exists) {
          return api.signin({ email }, Router.asPath).then(() => {
            Router.pushRoute('signinLinkSent', { email });
          });
        } else {
          this.setState({ unknownEmail: true, submitting: false });
        }
      })
      .catch(e => {
        this.setState({ error: e.message, submitting: false });
      });
  };

  createProfile = data => {
    if (this.state.submitting) {
      return false;
    }

    const redirect = window.location.pathname;
    const user = pick(data, ['email', 'firstName', 'lastName']);
    const organizationData = pick(data, ['orgName', 'githubHandle', 'twitterHandle', 'website']);
    const organization = Object.keys(organizationData).length > 0 ? organizationData : null;
    if (organization) {
      organization.name = organization.orgName;
      delete organization.orgName;
    }

    this.setState({ submitting: true });
    this.props
      .createUser({ user, organization, redirect })
      .then(() => {
        Router.pushRoute('signinLinkSent', { email: user.email });
      })
      .catch(error => {
        this.setState({ result: { error: error.message }, submitting: false });
      });
  };

  getLoggedInUserDefaultContibuteProfile() {
    if (get(this.state, 'stepProfile')) {
      return this.state.stepProfile;
    }

    const { LoggedInUser } = this.props;
    return !LoggedInUser ? null : { email: LoggedInUser.email, image: LoggedInUser.image, ...LoggedInUser.collective };
  }

  getLoggedInUserDefaultPaymentMethodId() {
    const pm = get(this.props.LoggedInUser, 'collective.paymentMethods', [])[0];
    return pm && pm.id;
  }

  /** Returns an array like [personnalProfile, otherProfiles] */
  getProfiles() {
    const { LoggedInUser } = this.props;
    return !LoggedInUser
      ? [{}, {}]
      : [
          { email: LoggedInUser.email, image: LoggedInUser.image, ...LoggedInUser.collective },
          LoggedInUser.memberOf
            .filter(m => m.role === 'ADMIN' && m.collective.id !== this.props.data.Collective.id)
            .map(({ collective }) => collective),
        ];
  }

  getContributorTypeName() {
    switch (this.props.verb) {
      case 'pay':
        return <FormattedMessage id="member.title" defaultMessage="member" />;
      default:
        return <FormattedMessage id="backer.title" defaultMessage="backer" />;
    }
  }

  renderPrevStepButton(step) {
    const prevStepIdx = STEPS.indexOf(step) - 1;
    if (prevStepIdx < 0) {
      return null;
    }

    return (
      <PrevNextButton onClick={() => this.changeStep(STEPS[prevStepIdx])} buttonStyle="standard">
        &larr; <FormattedMessage id="contribute.prevStep" defaultMessage="Previous step" />
      </PrevNextButton>
    );
  }

  renderNextStepButton(step) {
    const stepIdx = STEPS.indexOf(step);
    if (stepIdx === -1) {
      return null;
    }

    const isLast = stepIdx + 1 >= STEPS.length;
    const nextStep = isLast ? 'submit' : STEPS[stepIdx + 1];
    return (
      <PrevNextButton onClick={() => this.changeStep(nextStep)} buttonStyle="primary">
        {isLast ? (
          <FormattedMessage id="contribute.submit" defaultMessage="Submit" />
        ) : (
          <FormattedMessage id="contribute.nextStep" defaultMessage="Next step" />
        )}{' '}
        &rarr;
      </PrevNextButton>
    );
  }

  renderStep(step) {
    const { LoggedInUser } = this.props;
    const [personal, profiles] = this.getProfiles();

    if (step === 'contributeAs') {
      return (
        <StyledInputField htmlFor="contributeAs" label="Contribute as:">
          {fieldProps => (
            <ContributeAs
              {...fieldProps}
              onChange={profile => this.setState({ stepProfile: profile, stepPayment: null })}
              profiles={profiles}
              personal={personal}
              defaultSelectedProfile={this.getLoggedInUserDefaultContibuteProfile()}
            />
          )}
        </StyledInputField>
      );
    } else if (step === 'details') {
      return (
        <Flex alignItems="center" css={{ height: 300 }}>
          &rarr; Insert Details component here &larr;
        </Flex>
      );
    } else if (step === 'payment') {
      return (
        <ContributePayment
          onChange={stepPayment => this.setState({ stepPayment })}
          paymentMethods={get(LoggedInUser, 'collective.paymentMethods', [])}
          collective={this.state.stepProfile}
        />
      );
    } else if (step === 'submit') {
      return (
        <Flex justifyContent="center" alignItems="center" flexDirection="column">
          <Loading />
          <P color="red.700">__DEBUG__</P>
          <P color="red.700">Profile:</P>
          <textarea>{JSON.stringify(this.state.stepProfile)}</textarea>
          <P color="red.700">Details:</P>
          <textarea>{JSON.stringify(this.state.stepDetails)}</textarea>
          <P color="red.700">PaymentMethod:</P>
          <textarea>{JSON.stringify(this.state.stepPayment)}</textarea>
        </Flex>
      );
    }

    return null;
  }

  changeStep = step => {
    const { verb, data } = this.props;
    const params = {
      collectiveSlug: data.Collective.slug,
      step: step === 'contributeAs' ? undefined : step,
    };

    if (verb) {
      Router.pushRoute('donate', { ...params, verb });
    } else {
      Router.pushRoute('orderCollectiveTier', { ...params, TierId: this.props.TierId });
    }
  };

  renderStepsProgress(currentStep) {
    const loading = this.props.loadingLoggedInUser || this.state.loading || this.state.submitting;
    return (
      <StepsProgress
        steps={STEPS}
        focus={currentStep}
        allCompleted={currentStep === 'submit'}
        onStepSelect={this.changeStep}
        loadingStep={loading ? currentStep : undefined}
      >
        {({ step }) => {
          let label = null;
          let details = null;
          if (step === 'contributeAs') {
            label = <FormattedMessage id="contribute.step.contributeAs" defaultMessage="Contribute as" />;
            details = get(this.state, 'stepProfile.name', null);
          } else if (step === 'details') {
            label = <FormattedMessage id="contribute.step.details" defaultMessage="Details" />;
          } else if (step === 'payment') {
            label = <FormattedMessage id="contribute.step.payment" defaultMessage="Payment" />;
            const stepPayment = this.state.stepPayment;
            if (stepPayment) {
              details = get(stepPayment, 'title');
            }
          }

          return (
            <Flex flexDirection="column" alignItems="center">
              <StepLabel>{label}</StepLabel>
              <Span fontSize="Caption" textAlign="center">
                {details}
              </Span>
            </Flex>
          );
        }}
      </StepsProgress>
    );
  }

  renderContent() {
    const { LoggedInUser } = this.props;
    const { loading, submitting, unknownEmail } = this.state;

    if (!LoggedInUser) {
      return this.state.signIn ? (
        <Flex justifyContent="center">
          <SignIn
            onSubmit={this.signIn}
            onSecondaryAction={() => this.setState({ signIn: false })}
            loading={loading || submitting}
            unknownEmail={unknownEmail}
          />
        </Flex>
      ) : (
        <Flex justifyContent="center">
          <CreateProfile
            onPersonalSubmit={this.createProfile}
            onOrgSubmit={this.createProfile}
            onSecondaryAction={() => this.setState({ signIn: true })}
            submitting={submitting}
          />
        </Flex>
      );
    }

    const step = this.props.step || 'contributeAs';
    return (
      <Flex flexDirection="column" alignItems="center">
        <Box>{this.renderStep(step)}</Box>
        <Flex mt={5}>
          {this.renderPrevStepButton(step)}
          {this.renderNextStepButton(step)}
        </Flex>
      </Flex>
    );
  }

  render() {
    const { data, loadingLoggedInUser } = this.props;

    if (!data.Collective) {
      return <ErrorPage data={data} />;
    }

    const collective = data.Collective;
    const logo = collective.image || get(collective.parentCollective, 'image');
    const tierName = this.getContributorTypeName();

    return (
      <Page
        title={`Contribute - ${collective.name}`}
        description={collective.description}
        twitterHandle={collective.twitterHandle}
        image={collective.image || collective.backgroundImage}
      >
        <Flex alignItems="center" flexDirection="column" mx="auto" width={300} pt={4} mb={4}>
          <Link route="collective" params={{ slug: collective.slug }} className="goBack">
            <Logo
              src={logo}
              className="logo"
              type={collective.type}
              website={collective.website}
              height="10rem"
              key={logo}
            />
          </Link>

          <Link route="collective" params={{ slug: collective.slug }} className="goBack">
            <H2 as="h1" color="black.900">
              {collective.name}
            </H2>
          </Link>

          <P fontSize="LeadParagraph" fontWeight="LeadParagraph" color="black.600" mt={3}>
            <FormattedMessage
              id="contribute.contributorType"
              defaultMessage="Become a {name}"
              values={{ name: tierName }}
            />
          </P>
        </Flex>

        <Flex id="content" flexDirection="column" alignItems="center" mb={6}>
          <Box mb={3} width={0.8} css={{ maxWidth: 365, minHeight: 95 }}>
            {this.renderStepsProgress(this.props.step || 'contributeAs')}
          </Box>
          {loadingLoggedInUser || data.loading ? <Loading /> : this.renderContent()}
        </Flex>

        {/* TODO Errors below should be displayed somewhere else */}
        <div className="row result">
          <div className="col-sm-2" />
          <div className="col-sm-10">
            <div className="success">{this.state.result.success}</div>
            {this.state.result.error && <div className="error">{this.state.result.error}</div>}
          </div>
        </div>
      </Page>
    );
  }
}

const addData = graphql(gql`
  query Collective($slug: String) {
    Collective(slug: $slug) {
      id
      slug
      name
      description
      twitterHandle
      type
      website
      image
      backgroundImage
      currency
      parentCollective {
        image
      }
    }
  }
`);

const addCreateUserMutation = graphql(createUserQuery, {
  props: ({ mutate }) => ({
    createUser: variables => mutate({ variables }),
  }),
});

const addGraphQL = compose(
  addData,
  addCreateOrderMutation,
  addCreateUserMutation,
);

export default withIntl(addGraphQL(withUser(CreateOrderPage)));
